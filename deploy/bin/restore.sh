#!/usr/bin/env bash
# =============================================================================
# restore.sh — restauration des sauvegardes restic de Kemdia (S7-T05, ADR-0044). En root.
#
#   sudo /opt/kemdia/bin/restore.sh liste [--s3]
#       sauvegardes disponibles
#   sudo /opt/kemdia/bin/restore.sh fichiers <dossier vide> [--s3]
#       dernière copie des secrets et de la configuration de Caddy, extraite dans <dossier> (rien n'est remplacé)
#   sudo /opt/kemdia/bin/restore.sh verifier [env...]
#       restaure la dernière sauvegarde dans une base TEMPORAIRE (kemdia_verif), vérifie, puis la supprime ; relit
#       une partie des dépôts (local et S3). La base en service n'est pas touchée. Chaque dimanche (minuteur systemd).
#   sudo /opt/kemdia/bin/restore.sh remplacer <env> <sauvegarde|latest> --confirmer <env> [--s3]
#       la sauvegarde est d'abord restaurée À CÔTÉ (kemdia_restore) pendant que le site tourne ; si tout va bien, le
#       site et l'API s'arrêtent quelques secondes, la base en service est renommée kemdia_avant_<date> (gardée pour
#       revenir en arrière) et la restaurée prend sa place. --s3 : dépôt hors du serveur (serveur perdu, guide §11).
# =============================================================================
set -Eeuo pipefail
umask 077

# shellcheck source=deploy/bin/backup-lib.sh
source "$(dirname "$(readlink -f "$0")")/backup-lib.sh"
COMPOSE_FILE="$ROOT/app/compose.yml"

[[ $EUID -eq 0 ]] || die "à lancer en root (sudo)"
command -v restic >/dev/null || die "restic est requis (apt-get install restic)"
[[ -r $PASSWORD_FILE ]] || die "mot de passe des sauvegardes absent : $PASSWORD_FILE"

ARGS=()
USE_S3=false
CONFIRM=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --s3) USE_S3=true ;;
    --confirmer)
      CONFIRM=${2:-}
      shift
      ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done
set -- "${ARGS[@]}"
MODE=${1:-}

REPO=$LOCAL_REPO
if $USE_S3; then
  [[ -f $S3_CONF ]] || die "$S3_CONF absent (à recréer depuis le gestionnaire de mots de passe)"
  load_s3
  REPO=$S3_REPO
fi

psql_as() { # psql_as <env> <base> <sql> : dans le conteneur PostgreSQL de <env>
  docker exec "kemdia-$1-db" psql --username kemdia --dbname "$2" -v ON_ERROR_STOP=1 -Atqc "$3"
}
# Sauvegarde <id> de la base de <env> → base <cible> (vide, déjà créée)
restore_into() { # restore_into <env> <id> <cible>
  restic -r "$REPO" dump --quiet "$2" "/$1.dump" |
    docker exec -i "kemdia-$1-db" pg_restore --username kemdia --dbname "$3" --no-owner --exit-on-error --single-transaction
}
recreate() { # recreate <env> <base>
  psql_as "$1" postgres "DROP DATABASE IF EXISTS $2 WITH (FORCE)" &&
    psql_as "$1" postgres "CREATE DATABASE $2 OWNER kemdia"
}

case $MODE in
  liste)
    restic -r "$REPO" snapshots --host kemdia
    ;;

  fichiers)
    TARGET=$(realpath -m -- "${2:-}")
    [[ ${2:-} == /* && $TARGET != "$ROOT" && $TARGET != "$ROOT"/* ]] ||
      die "dossier absolu attendu, hors de $ROOT (rien n'est remplacé)"
    [[ ! -e $TARGET ]] || [[ -z $(ls -A "$TARGET") ]] || die "$TARGET n'est pas vide"
    restic -r "$REPO" restore --quiet --host kemdia --tag kemdia,fichiers latest --target "$TARGET"
    log "✅ secrets et configuration extraits dans $TARGET (chemins d'origine) : les remettre en place, puis supprimer $TARGET"
    ;;

  verifier)
    shift
    STATUS="$STATE_DIR/restore-check.last"
    write_status() {
      printf 'date=%s\nresultat=%s\n' "$(date -u +%FT%TZ)" "$1" >"$STATUS.tmp"
      chmod 644 "$STATUS.tmp"
      mv "$STATUS.tmp" "$STATUS"
    }
    STATUS_DONE=false
    trap '[[ $STATUS_DONE == true ]] || write_status echec:arret' EXIT
    exec 8>"$BACKUP_LOCK"
    flock -w 3600 8 || die "une sauvegarde occupe les dépôts depuis plus d'une heure"

    ENVS=("$@")
    if [[ ${#ENVS[@]} -eq 0 ]]; then
      for env in production staging; do [[ -f $STATE_DIR/$env.env ]] && ENVS+=("$env"); done
    fi
    failures=()
    for env in "${ENVS[@]}"; do
      [[ $env =~ ^(staging|production)$ ]] || die "environnement invalide : $env"
      id=$(snapshot_of "$REPO" "$env" latest || true)
      if [[ -z $id ]]; then
        log "❌ $env : aucune sauvegarde de la base"
        failures+=("$env")
        continue
      fi
      if ! recreate "$env" kemdia_verif; then
        log "❌ $env : base temporaire impossible à créer (la base tourne-t-elle ?)"
        failures+=("$env")
        continue
      fi
      if restore_into "$env" "$id" kemdia_verif; then
        tables=$(psql_as "$env" kemdia_verif "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')" || echo 0)
        migrations=$(psql_as "$env" kemdia_verif \
          "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL" 2>/dev/null || echo 0)
        if [[ $tables -gt 0 && $migrations -gt 0 ]]; then
          log "✅ $env : la sauvegarde ${id:0:8} se restaure ($tables tables, $migrations migrations)"
        else
          log "❌ $env : sauvegarde ${id:0:8} restaurée mais vide ou incomplète"
          failures+=("$env")
        fi
      else
        log "❌ $env : la sauvegarde ${id:0:8} ne se restaure pas"
        failures+=("$env")
      fi
      psql_as "$env" postgres "DROP DATABASE IF EXISTS kemdia_verif WITH (FORCE)" || true
    done
    # Une partie des données relue chaque semaine, ici ET hors du serveur : une corruption se voit avant d'en avoir besoin
    restic -r "$REPO" check --quiet --read-data-subset 10% || failures+=(depot)
    if ! $USE_S3 && [[ -f $S3_CONF ]]; then
      load_s3
      restic -r "$S3_REPO" check --quiet --read-data-subset 5% || failures+=(depot-s3)
    fi
    result=ok
    [[ ${#failures[@]} -eq 0 ]] || result="echec:${failures[*]}"
    write_status "${result// /,}"
    STATUS_DONE=true
    [[ $result == ok ]] || die "vérification de restauration : ${failures[*]}"
    ;;

  remplacer)
    ENVNAME=${2:-}
    SNAPSHOT=${3:-}
    [[ $ENVNAME =~ ^(staging|production)$ ]] || die "environnement invalide"
    [[ $SNAPSHOT =~ ^(latest|[a-f0-9]{8,64})$ ]] || die "sauvegarde invalide (latest ou identifiant de « restore.sh liste »)"
    [[ $CONFIRM == "$ENVNAME" ]] || die "remplacement de la base $ENVNAME : ajouter --confirmer $ENVNAME"
    STATE="$STATE_DIR/$ENVNAME.env"
    [[ -f $STATE ]] || die "$ENVNAME n'a jamais été déployé : lancer d'abord deploy.sh (même version que la sauvegarde)"
    # Ni déploiement ni sauvegarde pendant la restauration
    exec 9>"$STATE_DIR/$ENVNAME.lock"
    flock -n 9 || die "un déploiement $ENVNAME est en cours"
    exec 8>"$BACKUP_LOCK"
    flock -n 8 || die "une sauvegarde est en cours"
    compose() { docker compose --env-file "$STATE" -f "$COMPOSE_FILE" "$@"; }

    # La sauvegarde doit être CELLE de cet environnement, et lisible, avant de toucher à quoi que ce soit
    ID=$(snapshot_of "$REPO" "$ENVNAME" "$SNAPSHOT" || true)
    [[ -n $ID ]] || die "aucune sauvegarde de la base $ENVNAME ne correspond à « $SNAPSHOT »"
    restic -r "$REPO" ls --quiet "$ID" "/$ENVNAME.dump" | grep -qx "/$ENVNAME.dump" ||
      die "la sauvegarde ${ID:0:8} ne contient pas /$ENVNAME.dump"

    # 1. Restauration à côté, le site continue de tourner
    log "↩️  $ENVNAME : restauration de la sauvegarde ${ID:0:8} dans kemdia_restore"
    compose up -d --no-build --pull missing --wait --wait-timeout 120 db
    recreate "$ENVNAME" kemdia_restore
    if ! restore_into "$ENVNAME" "$ID" kemdia_restore; then
      psql_as "$ENVNAME" postgres "DROP DATABASE IF EXISTS kemdia_restore WITH (FORCE)" || true
      die "restauration échouée : la base en service n'a PAS été touchée"
    fi

    # 2. Bascule : quelques secondes sans site ; l'ancienne base est gardée sous un autre nom
    OLD="kemdia_avant_$(date -u +%Y%m%d%H%M%S)"
    compose stop web api
    if [[ $(psql_as "$ENVNAME" postgres "SELECT count(*) FROM pg_database WHERE datname = 'kemdia'") == 1 ]]; then
      psql_as "$ENVNAME" postgres \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'kemdia' AND pid <> pg_backend_pid()" >/dev/null
      psql_as "$ENVNAME" postgres "ALTER DATABASE kemdia RENAME TO $OLD"
    else
      OLD="" # aucune base en service
    fi
    psql_as "$ENVNAME" postgres "ALTER DATABASE kemdia_restore RENAME TO kemdia"
    if compose up -d --no-build --pull never --wait --wait-timeout 180 db api web; then
      log "✅ $ENVNAME : base restaurée (${ID:0:8}) et site en ligne"
      [[ -z $OLD ]] || log "   ancienne base gardée sous $OLD ; après contrôle : sudo docker exec kemdia-$ENVNAME-db psql -U kemdia -d postgres -c 'DROP DATABASE $OLD'"
      exit 0
    fi
    # 3. Le site ou l'API ne démarre pas sur la base restaurée : retour à l'ancienne base
    log "❌ le site ou l'API ne démarre pas sur la base restaurée (version différente de celle de la sauvegarde ?)"
    if [[ -n $OLD ]]; then
      compose stop web api || true
      psql_as "$ENVNAME" postgres "ALTER DATABASE kemdia RENAME TO kemdia_restore_echec" &&
        psql_as "$ENVNAME" postgres "ALTER DATABASE $OLD RENAME TO kemdia" &&
        compose up -d --no-build --pull never --wait --wait-timeout 180 db api web &&
        die "ancienne base remise en service ; la base restaurée reste sous kemdia_restore_echec"
    fi
    die "intervention manuelle requise (bases : kemdia, ${OLD:-aucune ancienne})"
    ;;

  *)
    die "usage : restore.sh liste [--s3] | fichiers <dossier> [--s3] | verifier [env…] | remplacer <env> <sauvegarde|latest> --confirmer <env> [--s3]"
    ;;
esac
