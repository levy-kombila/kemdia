#!/usr/bin/env bash
# =============================================================================
# deploy.sh — déploiement de Kemdia (site + API) sur le serveur, migrations, retour arrière.
#
# Appelé par GitHub Actions via SSH avec une clé RESTREINTE (« forced command ») :
# cette clé ne peut exécuter QUE ce script, rien d'autre.
#
#   Déployer (via SSH_ORIGINAL_COMMAND ou ligne de commande) :
#     <environnement> <image du site@sha256:digest> <image de l'API@sha256:digest> <version>
#   Revenir à la version précédente :
#     <environnement> rollback
#   Entrée standard (2 lignes, jamais écrites sur disque) :
#     <utilisateur registre>
#     <jeton de lecture du registre (GITHUB_TOKEN éphémère)>
#
# Images acceptées : seulement celles du dépôt déclaré dans /opt/kemdia/deploy.conf (REGISTRY=…, posé par
# setup-server.sh, propriété de root), suivies de /web ou /api et d'un digest (S7-T04, ADR-0043).
#
#   Exemple manuel (admin) :
#     /opt/kemdia/bin/deploy.sh staging ghcr.io/owner/kemdia/web@sha256:… ghcr.io/owner/kemdia/api@sha256:… sha-1a2b3c < /dev/null
# =============================================================================
set -Eeuo pipefail

ROOT=/opt/kemdia
STATE_DIR="$ROOT/state"
COMPOSE_FILE="$ROOT/app/compose.yml"
CONF="$ROOT/deploy.conf"
LOG="$ROOT/deploy.log"

log() { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "${ENVNAME:-?}" "$*" | tee -a "$LOG" >&2; }
die() {
  log "ERREUR : $*"
  exit 1
}

# --- 1. Lecture et VALIDATION STRICTE des arguments ---------------------------
set -f # pas d'expansion de jokers (*, ?) dans les arguments reçus
# shellcheck disable=SC2086
set -- ${SSH_ORIGINAL_COMMAND:-$*}
ENVNAME=${1:-}
[[ $ENVNAME =~ ^(staging|production)$ ]] || die "environnement invalide"

# Dépôt d'images autorisé : lu dans un fichier de root, jamais reçu de la CI
REGISTRY=$(sed -n 's/^REGISTRY=//p' "$CONF" 2>/dev/null | head -n 1)
[[ $REGISTRY =~ ^[a-z0-9.:-]+(/[a-z0-9._-]+)+$ ]] || die "dépôt d'images absent ou invalide dans $CONF"
REG_RE=${REGISTRY//./\\.}

MODE=deploy
if [[ $# -eq 2 && $2 == rollback ]]; then
  MODE=rollback
elif [[ $# -eq 4 ]]; then
  WEB_IMAGE=$2 API_IMAGE=$3 VERSION=$4
  # Déploiement par DIGEST uniquement, et seulement depuis NOTRE dépôt : image immuable, impossible à remplacer
  [[ $WEB_IMAGE =~ ^${REG_RE}/web@sha256:[a-f0-9]{64}$ ]] || die "image du site invalide (attendu $REGISTRY/web@sha256:…)"
  [[ $API_IMAGE =~ ^${REG_RE}/api@sha256:[a-f0-9]{64}$ ]] || die "image de l'API invalide (attendu $REGISTRY/api@sha256:…)"
  [[ $VERSION =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "version invalide"
else
  die "usage : deploy.sh <staging|production> <site@sha256:…> <api@sha256:…> <version> | <staging|production> rollback"
fi

# Secrets de l'environnement : écrits une fois par init-secrets.sh (jamais par ce script)
for part in db api web; do
  [[ -r $ROOT/secrets/$ENVNAME.$part.env ]] ||
    die "secrets absents : sudo $ROOT/bin/init-secrets.sh $ENVNAME <domaine>"
done

# Un seul déploiement à la fois par environnement
exec 9>"$STATE_DIR/$ENVNAME.lock"
flock -n 9 || die "un déploiement $ENVNAME est déjà en cours"

STATE="$STATE_DIR/$ENVNAME.env"
PREVIOUS="$STATE_DIR/$ENVNAME.previous.env"

compose() { docker compose --env-file "$STATE" -f "$COMPOSE_FILE" "$@"; }
up() { compose up -d --no-build --pull never --wait --wait-timeout 180 db api web; }

# Migrations avec l'image de l'API de l'état courant. Elles n'ajoutent que ce que l'ancienne version ignore
# (règle du projet : migrations d'ajout) : un retour arrière ne les défait pas et n'en a pas besoin.
migrate() {
  # PostgreSQL : image officielle, téléchargée seulement si absente (premier déploiement, nouvelle version mineure)
  compose up -d --no-build --pull missing --wait --wait-timeout 120 db
  compose --profile migrations run --rm --no-deps migrate
}

# --- Retour arrière demandé explicitement (ex. test de fumée échoué dans la CI) ---
if [[ $MODE == rollback ]]; then
  [[ -f $PREVIOUS ]] || die "aucune version précédente à restaurer"
  cp "$STATE" "$STATE.failed" 2>/dev/null || true
  cp "$PREVIOUS" "$STATE"
  log "↩️  retour arrière demandé : $(grep APP_VERSION "$STATE")"
  up && log "✅ version précédente rétablie" && exit 0
  die "le retour arrière a échoué"
fi

# --- 2. Téléchargement des images (identifiants éphémères, jamais sur disque durable)
REG_USER="" REG_TOKEN=""
if [[ ! -t 0 ]]; then
  IFS= read -r REG_USER || true
  IFS= read -r REG_TOKEN || true
fi
DOCKER_CONFIG_TMP=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG_TMP"' EXIT
if [[ -n $REG_USER && -n $REG_TOKEN ]]; then
  printf '%s' "$REG_TOKEN" | DOCKER_CONFIG=$DOCKER_CONFIG_TMP docker login "${REGISTRY%%/*}" -u "$REG_USER" --password-stdin >/dev/null
fi
log "téléchargement du site et de l'API ($VERSION)"
DOCKER_CONFIG=$DOCKER_CONFIG_TMP docker pull --quiet "$WEB_IMAGE" >/dev/null
DOCKER_CONFIG=$DOCKER_CONFIG_TMP docker pull --quiet "$API_IMAGE" >/dev/null
rm -rf "$DOCKER_CONFIG_TMP"

# --- 3. Migrations, puis bascule -----------------------------------------------
write_state() { # write_state <site> <api> <version>
  printf 'KEMDIA_ENV=%s\nKEMDIA_IMAGE=%s\nKEMDIA_API_IMAGE=%s\nAPP_VERSION=%s\n' "$ENVNAME" "$1" "$2" "$3" >"$STATE.tmp"
  mv "$STATE.tmp" "$STATE"
}

[[ -f $STATE ]] && cp "$STATE" "$PREVIOUS"
write_state "$WEB_IMAGE" "$API_IMAGE" "$VERSION"

if ! migrate; then
  log "❌ migrations refusées : rien n'a basculé"
  # L'état redevient celui d'avant (premier déploiement : aucun état)
  if [[ -f $PREVIOUS ]]; then cp "$PREVIOUS" "$STATE"; else rm -f "$STATE"; fi
  exit 1
fi
log "migrations appliquées"

if up; then
  log "✅ $VERSION en ligne (site et API sains)"
else
  log "❌ le site ou l'API n'est pas sain"
  if [[ -f $PREVIOUS ]]; then
    log "↩️  retour à la version précédente"
    cp "$PREVIOUS" "$STATE"
    up || log "ATTENTION : le retour arrière a aussi échoué, intervention manuelle requise"
  fi
  exit 1
fi

# --- 4. Ménage : images de plus de 14 jours non utilisées ---------------------
docker image prune -af --filter "until=336h" >/dev/null 2>&1 || true
