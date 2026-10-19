#!/usr/bin/env bash
# =============================================================================
# restore.sh — restauration des sauvegardes restic de Kemdia (S7-T05, ADR-0044). En root.
#
#   sudo /opt/kemdia/bin/restore.sh liste [--s3]
#       sauvegardes disponibles
#   sudo /opt/kemdia/bin/restore.sh verifier [env...]
#       restaure la dernière sauvegarde dans une base TEMPORAIRE (kemdia_verif), vérifie, puis la supprime ;
#       la base en service n'est pas touchée. Lancé chaque dimanche par kemdia-restore-check.timer.
#   sudo /opt/kemdia/bin/restore.sh fichiers <dossier vide> [--s3]
#       dernière copie des secrets et de la configuration de Caddy, extraite dans <dossier> (rien n'est remplacé)
#   sudo /opt/kemdia/bin/restore.sh remplacer <env> <sauvegarde|latest> --confirmer <env> [--s3]
#       REMPLACE la base de <env> par la sauvegarde : site et API arrêtés, base recréée, puis redémarrés.
#       --s3 : lire le dépôt hors du serveur (serveur perdu : voir docs/guides/deploiement.md §11).
# =============================================================================
set -Eeuo pipefail
umask 077

ROOT=${KEMDIA_ROOT:-/opt/kemdia}
SECRETS="$ROOT/secrets"
STATE_DIR="$ROOT/state"
COMPOSE_FILE="$ROOT/app/compose.yml"
S3_CONF="$SECRETS/backup-s3.env"
LOCAL_REPO=${KEMDIA_BACKUP_REPO:-/var/backups/kemdia}

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() {
  log "ERREUR : $*"
  exit 1
}

[[ $EUID -eq 0 ]] || die "à lancer en root (sudo)"
command -v restic >/dev/null || die "restic est requis (apt-get install restic)"
export RESTIC_PASSWORD_FILE="$SECRETS/backup.password"
export RESTIC_CACHE_DIR=/var/cache/kemdia-restic
[[ -r $RESTIC_PASSWORD_FILE ]] || die "mot de passe des sauvegardes absent : $RESTIC_PASSWORD_FILE"

ARGS=()
REPO=$LOCAL_REPO
CONFIRM=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --s3)
      S3_REPO=""
      [[ -f $S3_CONF ]] || die "$S3_CONF absent"
      while IFS='=' read -r key value; do
        case $key in
          RESTIC_S3_REPOSITORY) S3_REPO=$value ;;
          AWS_ACCESS_KEY_ID | AWS_SECRET_ACCESS_KEY | AWS_DEFAULT_REGION) export "$key=$value" ;;
          '' | \#*) ;;
          *) die "clé inconnue dans $S3_CONF : $key" ;;
        esac
      done <"$S3_CONF"
      [[ $S3_REPO =~ ^s3:https?://[A-Za-z0-9.:-]+/[a-z0-9._/-]+$ ]] || die "RESTIC_S3_REPOSITORY invalide"
      REPO=$S3_REPO
      ;;
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

db_exec() { # db_exec <env> <commande…> : dans le conteneur PostgreSQL de <env>
  local env=$1
  shift
  docker exec -i "kemdia-$env-db" "$@"
}
psql_as() { # psql_as <env> <base> <sql>
  db_exec "$1" psql --username kemdia --dbname "$2" -v ON_ERROR_STOP=1 -Atqc "$3"
}
# Dernière sauvegarde (ou celle demandée) de la base de <env>, envoyée sur la sortie standard
dump_of() { restic -r "$REPO" dump --quiet --tag "kemdia,base,$1" "$2" "/$1.dump"; }

case $MODE in
  liste)
    restic -r "$REPO" snapshots --host kemdia
    ;;

  fichiers)
    TARGET=${2:-}
    [[ $TARGET == /* && $TARGET != "$ROOT"* ]] || die "dossier absolu attendu, hors de $ROOT (rien n'est remplacé)"
    [[ ! -e $TARGET ]] || [[ -z $(ls -A "$TARGET") ]] || die "$TARGET n'est pas vide"
    restic -r "$REPO" restore --quiet --tag kemdia,fichiers latest --target "$TARGET"
    log "✅ secrets et configuration extraits dans $TARGET (chemins d'origine conservés) : les remettre en place à la main"
    ;;

  verifier)
    shift
    ENVS=("$@")
    if [[ ${#ENVS[@]} -eq 0 ]]; then
      for env in production staging; do [[ -f $STATE_DIR/$env.env ]] && ENVS+=("$env"); done
    fi
    failures=()
    for env in "${ENVS[@]}"; do
      [[ $env =~ ^(staging|production)$ ]] || die "environnement invalide : $env"
      if ! psql_as "$env" postgres "DROP DATABASE IF EXISTS kemdia_verif WITH (FORCE)" ||
        ! psql_as "$env" postgres "CREATE DATABASE kemdia_verif OWNER kemdia"; then
        log "❌ $env : base temporaire impossible à créer (la base tourne-t-elle ?)"
        failures+=("$env")
        continue
      fi
      if dump_of "$env" latest |
        db_exec "$env" pg_restore --username kemdia --dbname kemdia_verif --no-owner --exit-on-error --single-transaction; then
        tables=$(psql_as "$env" kemdia_verif "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
        migrations=$(psql_as "$env" kemdia_verif "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")
        if [[ $tables -gt 0 && $migrations -gt 0 ]]; then
          log "✅ $env : la dernière sauvegarde se restaure ($tables tables, $migrations migrations)"
        else
          log "❌ $env : sauvegarde restaurée mais vide"
          failures+=("$env")
        fi
      else
        log "❌ $env : la dernière sauvegarde ne se restaure pas"
        failures+=("$env")
      fi
      psql_as "$env" postgres "DROP DATABASE IF EXISTS kemdia_verif WITH (FORCE)" || true
    done
    # Lecture d'un dixième des données du dépôt chaque semaine : une corruption du disque se voit vite
    restic -r "$REPO" check --quiet --read-data-subset 10% || failures+=(depot)
    result=ok
    [[ ${#failures[@]} -eq 0 ]] || result="echec:${failures[*]}"
    printf 'date=%s\nresultat=%s\n' "$(date -u +%FT%TZ)" "${result// /,}" >"$STATE_DIR/restore-check.last.tmp"
    chmod 644 "$STATE_DIR/restore-check.last.tmp"
    mv "$STATE_DIR/restore-check.last.tmp" "$STATE_DIR/restore-check.last"
    [[ $result == ok ]] || die "vérification de restauration : ${failures[*]}"
    ;;

  remplacer)
    ENVNAME=${2:-}
    SNAPSHOT=${3:-}
    [[ $ENVNAME =~ ^(staging|production)$ ]] || die "environnement invalide"
    [[ $SNAPSHOT =~ ^(latest|[a-f0-9]{8,64})$ ]] || die "sauvegarde invalide (latest ou identifiant de restic liste)"
    [[ $CONFIRM == "$ENVNAME" ]] || die "remplacement de la base $ENVNAME : ajouter --confirmer $ENVNAME"
    STATE="$STATE_DIR/$ENVNAME.env"
    [[ -f $STATE ]] || die "$ENVNAME n'a jamais été déployé : lancer d'abord deploy.sh (même version que la sauvegarde)"
    # Pas de déploiement pendant la restauration (même verrou que deploy.sh)
    exec 9>"$STATE_DIR/$ENVNAME.lock"
    flock -n 9 || die "un déploiement $ENVNAME est en cours"
    compose() { docker compose --env-file "$STATE" -f "$COMPOSE_FILE" "$@"; }

    # La sauvegarde doit être lisible AVANT de toucher à quoi que ce soit
    restic -r "$REPO" snapshots --quiet --tag "kemdia,base,$ENVNAME" "$SNAPSHOT" >/dev/null ||
      die "sauvegarde $SNAPSHOT introuvable pour $ENVNAME"
    log "↩️  $ENVNAME : remplacement de la base par la sauvegarde $SNAPSHOT"
    compose stop web api
    compose up -d --no-build --pull missing --wait --wait-timeout 120 db
    psql_as "$ENVNAME" postgres "DROP DATABASE IF EXISTS kemdia WITH (FORCE)"
    psql_as "$ENVNAME" postgres "CREATE DATABASE kemdia OWNER kemdia"
    if ! dump_of "$ENVNAME" "$SNAPSHOT" |
      db_exec "$ENVNAME" pg_restore --username kemdia --dbname kemdia --no-owner --exit-on-error --single-transaction; then
      die "restauration échouée : la base $ENVNAME est VIDE, site et API arrêtés (relancer avec une autre sauvegarde)"
    fi
    compose up -d --no-build --pull never --wait --wait-timeout 180 db api web ||
      die "base restaurée, mais le site ou l'API ne démarre pas (version différente de celle de la sauvegarde ?)"
    log "✅ $ENVNAME : base restaurée et site en ligne"
    ;;

  *)
    die "usage : restore.sh liste [--s3] | fichiers <dossier> [--s3] | verifier [env…] | remplacer <env> <sauvegarde|latest> --confirmer <env> [--s3]"
    ;;
esac
