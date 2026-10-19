#!/usr/bin/env bash
# =============================================================================
# backup.sh — sauvegardes chiffrées de Kemdia avec restic (S7-T05, ADR-0044). En root.
#
#   sudo /opt/kemdia/bin/backup.sh init          une fois : mot de passe des sauvegardes + dépôts (local, S3)
#   sudo /opt/kemdia/bin/backup.sh [env...]      sauvegarde (par défaut : chaque environnement déployé)
#
# Lancé chaque nuit à 02:00 par le minuteur systemd kemdia-backup.timer (installé par setup-server.sh).
#
# Ce qui est sauvegardé :
#   - la base de chaque environnement : pg_dump DANS le conteneur PostgreSQL (même version que la base), envoyé
#     directement à restic (aucune copie en clair sur le disque) ;
#   - les fichiers de secrets (/opt/kemdia/secrets, sauf ceux des sauvegardes) et la configuration de Caddy : sans
#     TOTP_ENCRYPTION_KEY et KYC_ENCRYPTION_KEY, une base restaurée garde des données illisibles.
# Où : dépôt local /var/backups/kemdia, puis copie vers le dépôt S3 s'il est configuré
#   (/opt/kemdia/secrets/backup-s3.env). Tout est chiffré par restic (AES-256) avec /opt/kemdia/secrets/backup.password.
# Rétention : 7 sauvegardes quotidiennes, 4 hebdomadaires, 6 mensuelles.
# Résultat : /opt/kemdia/state/backup.last (lu par la surveillance, S7-T06).
# =============================================================================
set -Eeuo pipefail
umask 077

# shellcheck source=deploy/bin/backup-lib.sh
source "$(dirname "$(readlink -f "$0")")/backup-lib.sh"
STATUS="$STATE_DIR/backup.last"
KEEP=(--keep-daily 7 --keep-weekly 4 --keep-monthly 6)

[[ $EUID -eq 0 ]] || die "à lancer en root (sudo)"
command -v restic >/dev/null || die "restic est requis (apt-get install restic)"

# --- init : une seule fois par serveur -----------------------------------------
if [[ ${1:-} == init ]]; then
  [[ -d $SECRETS ]] || die "$SECRETS absent : lancer d'abord setup-server.sh"
  if [[ ! -f $PASSWORD_FILE ]]; then
    tmp=$(mktemp "$SECRETS/.tmp.XXXXXX")
    openssl rand -base64 48 | tr -d '\n' >"$tmp"
    chmod 600 "$tmp"
    mv -n "$tmp" "$PASSWORD_FILE"
    rm -f "$tmp"
    log "mot de passe des sauvegardes créé : $PASSWORD_FILE (à copier dans ton gestionnaire de mots de passe)"
  fi
  install -d -m 700 "$LOCAL_REPO" "$RESTIC_CACHE_DIR"
  repo_ready "$LOCAL_REPO" || restic -r "$LOCAL_REPO" init >/dev/null
  log "dépôt local prêt : $LOCAL_REPO"
  load_s3
  if [[ -n $S3_REPO ]]; then
    repo_ready "$S3_REPO" || restic -r "$S3_REPO" init >/dev/null
    log "dépôt S3 prêt : ${S3_REPO%%/*}//…"
  else
    log "pas de dépôt S3 ($S3_CONF absent) : sauvegardes sur ce serveur seulement"
  fi
  exit 0
fi

# --- sauvegarde ----------------------------------------------------------------
ENVS=() S3_REPO=""
write_status() { # write_status <résultat> : lu par la surveillance (S7-T06)
  printf 'date=%s\nresultat=%s\nenvironnements=%s\ns3=%s\n' "$(date -u +%FT%TZ)" "$1" "${ENVS[*]:-}" \
    "$([[ -n $S3_REPO ]] && echo oui || echo non)" >"$STATUS.tmp"
  chmod 644 "$STATUS.tmp"
  mv "$STATUS.tmp" "$STATUS"
}
# Arrêt avant la fin (mot de passe absent, dépôt illisible…) : l'état dit « échec », jamais l'ancien « ok »
STATUS_DONE=false
trap '[[ $STATUS_DONE == true ]] || write_status echec:arret' EXIT

[[ -r $PASSWORD_FILE ]] || die "mot de passe absent : sudo $ROOT/bin/backup.sh init"
repo_ready "$LOCAL_REPO" || die "dépôt local absent ou illisible : sudo $ROOT/bin/backup.sh init"
load_s3

ENVS=("$@")
if [[ ${#ENVS[@]} -eq 0 ]]; then
  for env in production staging; do [[ -f $STATE_DIR/$env.env ]] && ENVS+=("$env"); done
fi
for env in "${ENVS[@]}"; do [[ $env =~ ^(staging|production)$ ]] || die "environnement invalide : $env"; done

exec 8>"$BACKUP_LOCK"
flock -n 8 || die "une sauvegarde est déjà en cours"

failures=()
for env in "${ENVS[@]}"; do
  db="kemdia-$env-db"
  if [[ $(docker inspect -f '{{.State.Health.Status}}' "$db" 2>/dev/null) != healthy ]]; then
    log "❌ $env : la base ($db) ne tourne pas"
    failures+=("$env")
    continue
  fi
  # Envoi direct pg_dump → restic (rien en clair sur le disque). restic 0.16 (Ubuntu 24.04) enregistre ce qu'il a
  # reçu même si pg_dump s'arrête en route : une telle sauvegarde tronquée est aussitôt supprimée.
  out=$(mktemp)
  set +e
  docker exec "$db" pg_dump --username kemdia --dbname kemdia --format custom --compress 0 |
    restic -r "$LOCAL_REPO" backup --json --host kemdia --tag "kemdia,base,$env" --stdin --stdin-filename "$env.dump" >"$out"
  status=("${PIPESTATUS[@]}")
  set -e
  snapshot=$(grep -o '"snapshot_id":"[a-f0-9]*"' "$out" | cut -d'"' -f4 || true)
  rm -f "$out"
  if [[ ${status[0]} -eq 0 && ${status[1]} -eq 0 && -n $snapshot ]]; then
    log "✅ $env : base sauvegardée (${snapshot:0:8})"
  else
    if [[ -n $snapshot ]] && ! restic -r "$LOCAL_REPO" forget --quiet "$snapshot"; then
      log "❌ $env : sauvegarde tronquée ${snapshot:0:8} NON supprimée (à faire : restic forget)"
    fi
    log "❌ $env : sauvegarde de la base échouée (pg_dump ${status[0]}, restic ${status[1]})"
    failures+=("$env")
  fi
done

files=()
for f in "$SECRETS" "$ROOT/proxy/.env"; do [[ -e $f ]] && files+=("$f"); done
if [[ ${#files[@]} -gt 0 ]]; then
  restic -r "$LOCAL_REPO" backup --quiet --host kemdia --tag kemdia,fichiers \
    --exclude "$SECRETS/backup*" --exclude "$SECRETS/.tmp.*" "${files[@]}" ||
    { log "❌ fichiers de secrets non sauvegardés" && failures+=(fichiers); }
fi

prune() { restic -r "$1" forget --quiet --host kemdia --group-by host,tags "${KEEP[@]}" --prune; }
prune "$LOCAL_REPO" || failures+=(retention-locale)
restic -r "$LOCAL_REPO" check --quiet || failures+=(verification-locale)

if [[ -n $S3_REPO ]]; then
  # Copie hors du serveur : ce qui manque dans le dépôt S3 y est recopié (même mot de passe)
  if RESTIC_FROM_PASSWORD_FILE=$PASSWORD_FILE restic -r "$S3_REPO" copy --quiet --from-repo "$LOCAL_REPO"; then
    prune "$S3_REPO" || failures+=(retention-s3)
    log "✅ copie hors du serveur (S3) à jour"
  else
    log "❌ copie vers S3 échouée"
    failures+=(s3)
  fi
fi

result=ok
[[ ${#failures[@]} -eq 0 ]] || result="echec:${failures[*]}"
write_status "${result// /,}"
STATUS_DONE=true
[[ $result == ok ]] || die "sauvegarde incomplète : ${failures[*]}"
log "✅ sauvegarde terminée"
