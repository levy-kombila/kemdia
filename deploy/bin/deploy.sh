#!/usr/bin/env bash
# =============================================================================
# deploy.sh — déploiement d'une image Kemdia sur le serveur, avec retour arrière.
#
# Appelé par GitHub Actions via SSH avec une clé RESTREINTE (« forced command ») :
# cette clé ne peut exécuter QUE ce script, rien d'autre.
#
#   Arguments (via SSH_ORIGINAL_COMMAND ou ligne de commande) :
#     <environnement> <image@sha256:digest> <version>
#   Entrée standard (2 lignes, jamais écrites sur disque) :
#     <utilisateur registre>
#     <jeton de lecture du registre (GITHUB_TOKEN éphémère)>
#
#   Exemple manuel (admin, sans registre privé) :
#     /opt/kemdia/bin/deploy.sh staging ghcr.io/owner/kemdia/web@sha256:abc... sha-1a2b3c < /dev/null
# =============================================================================
set -Eeuo pipefail

ROOT=/opt/kemdia
STATE_DIR="$ROOT/state"
COMPOSE_FILE="$ROOT/app/compose.yml"
LOG="$ROOT/deploy.log"

log() { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "${ENVNAME:-?}" "$*" | tee -a "$LOG" >&2; }
die() { log "ERREUR : $*"; exit 1; }

# --- 1. Lecture et VALIDATION STRICTE des arguments ---------------------------
set -f # pas d'expansion de jokers (*, ?) dans les arguments reçus
# shellcheck disable=SC2086
set -- ${SSH_ORIGINAL_COMMAND:-$*}
[[ $# -eq 3 ]] || die "usage : deploy.sh <staging|production> <image@sha256:...|rollback> <version>"
ENVNAME=$1 IMAGE=$2 VERSION=$3

[[ $ENVNAME =~ ^(staging|production)$ ]] || die "environnement invalide"
# Déploiement par DIGEST uniquement : l'image est immuable, impossible de la remplacer en douce
[[ $IMAGE == rollback || $IMAGE =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] ||
  die "image invalide (attendu ghcr.io/...@sha256:... ou rollback)"
[[ $VERSION =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "version invalide"

# Un seul déploiement à la fois par environnement
exec 9>"$STATE_DIR/$ENVNAME.lock"
flock -n 9 || die "un déploiement $ENVNAME est déjà en cours"

STATE="$STATE_DIR/$ENVNAME.env"
PREVIOUS="$STATE_DIR/$ENVNAME.previous.env"

up() {
  docker compose --env-file "$STATE" -f "$COMPOSE_FILE" up -d --no-build --pull never \
    --wait --wait-timeout 120
}

# --- Retour arrière demandé explicitement (ex. test de fumée échoué dans la CI) ---
if [[ $IMAGE == rollback ]]; then
  [[ -f $PREVIOUS ]] || die "aucune version précédente à restaurer"
  cp "$STATE" "$STATE.failed" 2>/dev/null || true
  cp "$PREVIOUS" "$STATE"
  log "↩️  retour arrière demandé : $(grep APP_VERSION "$STATE")"
  up && log "✅ version précédente rétablie" && exit 0
  die "le retour arrière a échoué"
fi

# --- 2. Téléchargement de l'image (identifiants éphémères, jamais sur disque durable)
REG_USER="" REG_TOKEN=""
if [[ ! -t 0 ]]; then
  IFS= read -r REG_USER || true
  IFS= read -r REG_TOKEN || true
fi

DOCKER_CONFIG_TMP=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG_TMP"' EXIT
if [[ -n $REG_USER && -n $REG_TOKEN ]]; then
  printf '%s' "$REG_TOKEN" | DOCKER_CONFIG=$DOCKER_CONFIG_TMP docker login ghcr.io -u "$REG_USER" --password-stdin >/dev/null
fi
log "téléchargement de $IMAGE ($VERSION)"
DOCKER_CONFIG=$DOCKER_CONFIG_TMP docker pull --quiet "$IMAGE" >/dev/null
rm -rf "$DOCKER_CONFIG_TMP"

# --- 3. Bascule -----------------------------------------------------------------
write_state() {
  printf 'KEMDIA_ENV=%s\nKEMDIA_IMAGE=%s\nAPP_VERSION=%s\n' "$ENVNAME" "$1" "$2" >"$STATE.tmp"
  mv "$STATE.tmp" "$STATE"
}

[[ -f $STATE ]] && cp "$STATE" "$PREVIOUS"
write_state "$IMAGE" "$VERSION"

if up; then
  log "✅ $VERSION en ligne (conteneur sain)"
else
  log "❌ le nouveau conteneur n'est pas sain"
  if [[ -f $PREVIOUS ]]; then
    log "↩️  retour à la version précédente"
    cp "$PREVIOUS" "$STATE"
    up || log "ATTENTION : le retour arrière a aussi échoué, intervention manuelle requise"
  fi
  exit 1
fi

# --- 4. Ménage : images de plus de 14 jours non utilisées ---------------------
docker image prune -af --filter "until=336h" >/dev/null 2>&1 || true
