# shellcheck shell=bash disable=SC2034
# =============================================================================
# backup-lib.sh — réglages communs à backup.sh et restore.sh (S7-T05, ADR-0044). Lu par `source`, jamais exécuté.
# =============================================================================

ROOT=${KEMDIA_ROOT:-/opt/kemdia}
SECRETS="$ROOT/secrets"
STATE_DIR="$ROOT/state"
PASSWORD_FILE="$SECRETS/backup.password"
S3_CONF="$SECRETS/backup-s3.env"
LOCAL_REPO=${KEMDIA_BACKUP_REPO:-/var/backups/kemdia}
# Un seul travail sur les sauvegardes à la fois (sauvegarde, vérification, restauration)
BACKUP_LOCK=${KEMDIA_BACKUP_LOCK:-/run/kemdia-backup.lock}

export RESTIC_PASSWORD_FILE=$PASSWORD_FILE
export RESTIC_CACHE_DIR=/var/cache/kemdia-restic
export RESTIC_PROGRESS_FPS=0.016 # pas de barre de progression dans le journal

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() {
  log "ERREUR : $*"
  exit 1
}

# Dépôt S3 (facultatif). Seules ces quatre clés sont lues, le fichier n'est jamais exécuté. Tolère une dernière ligne
# sans retour à la ligne, des fins de ligne Windows et des guillemets (copié-collé d'un gestionnaire de mots de passe).
S3_REPO=""
load_s3() {
  [[ -f $S3_CONF ]] || return 0
  local key value
  while IFS='=' read -r key value || [[ -n $key ]]; do
    key=${key%$'\r'} value=${value%$'\r'}
    [[ $value =~ ^\"(.*)\"$ || $value =~ ^\'(.*)\'$ ]] && value=${BASH_REMATCH[1]}
    case $key in
      RESTIC_S3_REPOSITORY) S3_REPO=$value ;;
      AWS_ACCESS_KEY_ID | AWS_SECRET_ACCESS_KEY | AWS_DEFAULT_REGION) export "$key=$value" ;;
      '' | \#*) ;;
      *) die "clé inconnue dans $S3_CONF : $key" ;;
    esac
  done <"$S3_CONF"
  # Fichier présent mais adresse absente : erreur, jamais un « local seulement » silencieux
  [[ $S3_REPO =~ ^s3:https?://[A-Za-z0-9.:-]+/[a-z0-9._/-]+$ ]] ||
    die "RESTIC_S3_REPOSITORY absent ou invalide dans $S3_CONF (attendu s3:https://<hôte>/<bucket>)"
}

repo_ready() { restic -r "$1" cat config >/dev/null 2>&1; }

# Identifiant complet de la sauvegarde de la base de <env> : <id> (préfixe accepté) ou latest.
# Un identifiant explicite fait IGNORER les filtres de restic (--tag) : on cherche donc l'identifiant DANS la liste
# filtrée, pour ne jamais prendre la sauvegarde d'un autre environnement ou celle des secrets (relecture S7-T05).
snapshot_of() { # snapshot_of <dépôt> <env> <id|latest>
  local ids
  ids=$(restic -r "$1" snapshots --json --host kemdia --tag "kemdia,base,$2" |
    grep -o '"id":"[a-f0-9]\{64\}"' | cut -d'"' -f4) || return 1
  if [[ $3 == latest ]]; then
    tail -n 1 <<<"$ids"
  else
    grep -m 1 "^$3" <<<"$ids"
  fi
}
