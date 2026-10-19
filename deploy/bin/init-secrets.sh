#!/usr/bin/env bash
# =============================================================================
# init-secrets.sh — secrets d'un environnement Kemdia, tirés au hasard SUR LE SERVEUR (S7-T04, ADR-0043).
# À lancer UNE fois par environnement, en root :
#
#   sudo /opt/kemdia/bin/init-secrets.sh production kemdia.ga
#   sudo /opt/kemdia/bin/init-secrets.sh staging staging.kemdia.ga
#
# Écrit trois fichiers, chacun lisible seulement par root et le groupe « deploy » (0640) :
#   /opt/kemdia/secrets/<env>.db.env   mot de passe de PostgreSQL
#   /opt/kemdia/secrets/<env>.api.env  adresse de la base, clé interne, clés de chiffrement, e-mails
#   /opt/kemdia/secrets/<env>.web.env  clé interne et adresse publique du site (rien d'autre : moindre privilège)
#
# Ne remplace JAMAIS un fichier existant : une clé de chiffrement perdue rend illisibles les dossiers des vendeurs
# (KYC_ENCRYPTION_KEY) et les doubles authentifications (TOTP_ENCRYPTION_KEY). Les secrets ne passent ni par Git,
# ni par GitHub, ni par l'écran : ce script n'en affiche aucun.
# =============================================================================
set -Eeuo pipefail
umask 077

ENVNAME=${1:-}
DOMAIN=${2:-}
DIR=${KEMDIA_SECRETS_DIR:-/opt/kemdia/secrets}
GROUP=${KEMDIA_SECRETS_GROUP:-deploy}

die() { printf 'ERREUR : %s\n' "$*" >&2; exit 1; }
[[ $ENVNAME =~ ^(staging|production)$ ]] || die "usage : init-secrets.sh <staging|production> <domaine>"
# Nom de domaine simple (lettres, chiffres, points, tirets) : il finit dans une adresse https://
[[ $DOMAIN =~ ^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$ ]] || die "domaine invalide : $DOMAIN"
[[ $EUID -eq 0 ]] || die "à lancer en root (sudo)"
command -v openssl >/dev/null || die "openssl est requis"
getent group "$GROUP" >/dev/null || die "groupe $GROUP introuvable (setup-server.sh l'a-t-il créé ?)"

DB_FILE="$DIR/$ENVNAME.db.env"
API_FILE="$DIR/$ENVNAME.api.env"
WEB_FILE="$DIR/$ENVNAME.web.env"
for f in "$DB_FILE" "$API_FILE" "$WEB_FILE"; do
  [[ -e $f ]] && die "$f existe déjà : rien n'est remplacé (une clé perdue rend des données illisibles)"
done

# 32 octets en base64url sans « = » (43 caractères), le format attendu par l'API pour les clés de chiffrement
key32() { openssl rand 32 | base64 | tr '+/' '-_' | tr -d '=\n'; }
# Clé interne site ↔ API : 48 octets → 64 caractères parmi A-Z a-z 0-9 - _
internal_key() { openssl rand 48 | base64 | tr '+/' '-_' | tr -d '=\n'; }
# Mot de passe de la base : hexadécimal (aucun caractère à échapper dans une adresse postgresql://)
DB_PASSWORD=$(openssl rand -hex 32)
INTERNAL_KEY=$(internal_key)
TOTP_KEY=$(key32)
KYC_KEY=$(key32)
while [[ $KYC_KEY == "$TOTP_KEY" ]]; do KYC_KEY=$(key32); done
NOW=$(date -u +%FT%TZ)

install -d -m 750 -o root -g "$GROUP" "$DIR"

# Les trois fichiers sont d'abord écrits à part (umask 077 : jamais lisibles par d'autres), puis mis en place
# ensemble : une erreur au milieu ne laisse pas un mot de passe de base sans le fichier de l'API qui va avec.
TMPS=()
cleanup() { [[ ${#TMPS[@]} -eq 0 ]] || rm -f "${TMPS[@]}"; }
trap cleanup EXIT
stage() { # stage <variable> : contenu sur l'entrée standard ; chemin du fichier temporaire dans <variable>
  local tmp
  tmp=$(mktemp "$DIR/.tmp.XXXXXX")
  TMPS+=("$tmp")
  cat >"$tmp"
  chown "root:$GROUP" "$tmp"
  chmod 640 "$tmp"
  printf -v "$1" '%s' "$tmp"
}

stage DB_TMP <<SECRETS
# Kemdia $ENVNAME — PostgreSQL. Généré le $NOW par init-secrets.sh. Ne jamais copier dans Git ni dans un message.
POSTGRES_PASSWORD=$DB_PASSWORD
SECRETS

stage API_TMP <<SECRETS
# Kemdia $ENVNAME — API. Généré le $NOW par init-secrets.sh. Ne jamais copier dans Git ni dans un message.
# Garder une copie de TOTP_ENCRYPTION_KEY et KYC_ENCRYPTION_KEY dans un gestionnaire de mots de passe :
# perdues, les doubles authentifications et les dossiers des vendeurs deviennent illisibles.
# Valeur ajoutée à la main contenant « \$ » : l'écrire « \$\$ » (docker compose lit ce fichier et interprète « \$ »).
DATABASE_URL=postgresql://kemdia:$DB_PASSWORD@db:5432/kemdia
API_INTERNAL_KEY=$INTERNAL_KEY
TOTP_ENCRYPTION_KEY=$TOTP_KEY
KYC_ENCRYPTION_KEY=$KYC_KEY
CORS_ORIGINS=https://$DOMAIN
LOG_LEVEL=info
# E-mails : « none » tant que Brevo n'est pas configuré. Pour l'activer : EMAIL_TRANSPORT=brevo, BREVO_API_KEY et
# EMAIL_FROM (adresse vérifiée dans Brevo), puis redéployer.
EMAIL_TRANSPORT=none
SECRETS

stage WEB_TMP <<SECRETS
# Kemdia $ENVNAME — site. Généré le $NOW par init-secrets.sh. Ne jamais copier dans Git ni dans un message.
API_INTERNAL_KEY=$INTERNAL_KEY
SITE_URL=https://$DOMAIN
SECRETS

for pair in "$DB_TMP:$DB_FILE" "$API_TMP:$API_FILE" "$WEB_TMP:$WEB_FILE"; do
  mv -n "${pair%%:*}" "${pair#*:}" || true
  [[ -e ${pair%%:*} ]] && die "${pair#*:} est apparu pendant l'écriture : rien n'est remplacé"
done
TMPS=()

printf "✅ Secrets de %s écrits dans %s (db, api, web — 0640 root:%s). Aucun n'a été affiché.\n" \
  "$ENVNAME" "$DIR" "$GROUP"
printf '   Sauvegarde : copier TOTP_ENCRYPTION_KEY et KYC_ENCRYPTION_KEY de %s dans ton gestionnaire de mots de passe.\n' \
  "$API_FILE"
