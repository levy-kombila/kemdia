#!/usr/bin/env bash
# =============================================================================
# monitor.sh — surveillance interne du serveur Kemdia (S7-T06, ADR-0045). En root, toutes les 5 minutes
# (minuteur systemd kemdia-monitor.timer, installé par setup-server.sh).
#
#   sudo /opt/kemdia/bin/monitor.sh
#
# Vérifie, pour chaque environnement déployé : base, API et site sains (Docker) ; et pour le serveur : Caddy, parcours
# complet https → site → API → base (production), certificats HTTPS, disque, mémoire, sauvegardes de la nuit et
# vérification de restauration du dimanche.
#
# Résultat envoyé à Healthchecks.io (adresse de « ping » dans /opt/kemdia/secrets/monitor.env, 0600 root) :
#   tout va bien → ping ;  problème → ping « /fail » avec la liste des problèmes (Healthchecks t'alerte).
#   Silence (serveur éteint, minuteur arrêté) → Healthchecks t'alerte aussi, après le délai de grâce.
# Aussi écrit dans /opt/kemdia/state/monitor.last et le journal (journalctl -u kemdia-monitor).
# Les messages ne contiennent aucun secret ni aucune donnée personnelle : seulement le nom des vérifications.
# =============================================================================
set -Eeuo pipefail
umask 077

ROOT=${KEMDIA_ROOT:-/opt/kemdia}
STATE_DIR="$ROOT/state"
CONF="$ROOT/secrets/monitor.env"
PROXY_ENV="$ROOT/proxy/.env"
STATUS="$STATE_DIR/monitor.last"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() {
  log "ERREUR : $*"
  exit 1
}
[[ $EUID -eq 0 ]] || die "à lancer en root (sudo)"

# --- Réglages (seules ces clés sont lues ; le fichier n'est jamais exécuté) -----
HC_PING_URL="" DISK_MAX_PCT=85 MEM_MIN_PCT=10 CERT_MIN_DAYS=14 BACKUP_MAX_HOURS=26 RESTORE_CHECK_MAX_DAYS=8
if [[ -f $CONF ]]; then
  while IFS='=' read -r key value || [[ -n $key ]]; do
    key=${key%$'\r'} value=${value%$'\r'}
    [[ $value =~ ^\"(.*)\"$ ]] && value=${BASH_REMATCH[1]}
    case $key in
      HC_PING_URL)
        [[ $value =~ ^https?://[A-Za-z0-9.:-]+(/[A-Za-z0-9._~-]+)+$ ]] || die "HC_PING_URL invalide dans $CONF"
        HC_PING_URL=$value
        ;;
      DISK_MAX_PCT | MEM_MIN_PCT | CERT_MIN_DAYS | BACKUP_MAX_HOURS | RESTORE_CHECK_MAX_DAYS)
        [[ $value =~ ^[0-9]{1,4}$ ]] || die "$key invalide dans $CONF (nombre entier attendu)"
        printf -v "$key" '%s' "$value"
        ;;
      '' | \#*) ;;
      *) die "clé inconnue dans $CONF : $key" ;;
    esac
  done <"$CONF"
fi

proxy_var() { { sed -n "s/^$1=//p" "$PROXY_ENV" 2>/dev/null || true; } | head -n 1 | tr -d '\r"'; }
# Valeur d'une ligne « clé=valeur » d'un fichier d'état
state_var() { { sed -n "s/^$2=//p" "$1" 2>/dev/null || true; } | head -n 1; }
age_seconds() { # age_seconds <date ISO 8601> : secondes écoulées (très grand si la date est illisible)
  local since
  since=$(date -u -d "$1" +%s 2>/dev/null) || {
    echo 999999999
    return
  }
  echo $(($(date -u +%s) - since))
}

problems=()
problem() {
  problems+=("$*")
  log "❌ $*"
}

# --- 1. Conteneurs de chaque environnement déployé ----------------------------
envs=()
for env in production staging; do [[ -f $STATE_DIR/$env.env ]] && envs+=("$env"); done
[[ ${#envs[@]} -gt 0 ]] || problem "aucun environnement déployé"
for env in "${envs[@]}"; do
  for part in db api web; do
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "kemdia-$env-$part" 2>/dev/null || echo absent)
    [[ $health == healthy ]] || problem "$env : $part $health"
  done
done
[[ $(docker inspect -f '{{.State.Status}}' kemdia-caddy 2>/dev/null || echo absent) == running ]] ||
  problem "caddy (HTTPS) arrêté"

# --- 2. Parcours complet de la production, comme un visiteur (https → Caddy → site → API → base) -----------------
PROD_DOMAIN=$(proxy_var PROD_DOMAIN)
STAGING_DOMAIN=$(proxy_var STAGING_DOMAIN)
if [[ " ${envs[*]} " == *" production "* && -n $PROD_DOMAIN ]]; then
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$PROD_DOMAIN:443:127.0.0.1" \
    "https://$PROD_DOMAIN/api/health?complet=1" || true)
  [[ $code == 200 ]] || problem "production : parcours https → site → API → base en échec (HTTP ${code:-000})"
fi

# --- 3. Certificats HTTPS (Caddy les renouvelle 30 jours avant : sous le seuil, le renouvellement échoue) ---------
for domain in $PROD_DOMAIN $STAGING_DOMAIN; do
  end=$(openssl s_client -connect 127.0.0.1:443 -servername "$domain" </dev/null 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)
  if [[ -z $end ]]; then
    problem "certificat de $domain illisible"
    continue
  fi
  end_s=$(date -u -d "$end" +%s 2>/dev/null) || {
    problem "certificat de $domain : date d'expiration illisible"
    continue
  }
  days=$(((end_s - $(date -u +%s)) / 86400))
  [[ $days -ge $CERT_MIN_DAYS ]] || problem "certificat de $domain : expire dans $days jour(s)"
done

# --- 4. Disque et mémoire -----------------------------------------------------
for path in / /var/lib/docker; do
  [[ -d $path ]] || continue
  pct=$(df --output=pcent "$path" | tail -n 1 | tr -dc '0-9')
  [[ $pct -lt $DISK_MAX_PCT ]] || problem "disque $path plein à $pct %"
done
mem_total=$(sed -n 's/^MemTotal: *\([0-9]*\).*/\1/p' /proc/meminfo)
mem_avail=$(sed -n 's/^MemAvailable: *\([0-9]*\).*/\1/p' /proc/meminfo)
mem_pct=$((mem_avail * 100 / mem_total))
[[ $mem_pct -ge $MEM_MIN_PCT ]] || problem "mémoire libre : $mem_pct %"

# --- 5. Sauvegardes (S7-T05) --------------------------------------------------
if [[ ! -f $ROOT/secrets/backup.password ]]; then
  problem "sauvegardes non configurées (sudo $ROOT/bin/backup.sh init)"
else
  last=$STATE_DIR/backup.last
  if [[ ! -f $last ]]; then
    # Serveur neuf : la première nuit n'est pas encore passée
    [[ $(($(date +%s) - $(stat -c %Y "$ROOT/secrets/backup.password"))) -lt $((BACKUP_MAX_HOURS * 3600)) ]] ||
      problem "aucune sauvegarde faite"
  else
    [[ $(state_var "$last" resultat) == ok ]] || problem "dernière sauvegarde : $(state_var "$last" resultat)"
    [[ $(age_seconds "$(state_var "$last" date)") -lt $((BACKUP_MAX_HOURS * 3600)) ]] ||
      problem "dernière sauvegarde trop ancienne ($(state_var "$last" date))"
  fi
  check=$STATE_DIR/restore-check.last
  if [[ -f $check ]]; then
    [[ $(state_var "$check" resultat) == ok ]] ||
      problem "vérification de restauration : $(state_var "$check" resultat)"
    [[ $(age_seconds "$(state_var "$check" date)") -lt $((RESTORE_CHECK_MAX_DAYS * 86400)) ]] ||
      problem "vérification de restauration trop ancienne ($(state_var "$check" date))"
  elif [[ $(($(date +%s) - $(stat -c %Y "$ROOT/secrets/backup.password"))) -ge $((RESTORE_CHECK_MAX_DAYS * 86400)) ]]; then
    problem "restauration jamais vérifiée"
  fi
fi

# --- Résultat -------------------------------------------------------------------
if [[ ${#problems[@]} -eq 0 ]]; then
  result=ok
  report="Kemdia : tout va bien (${envs[*]})"
else
  result="echec:${#problems[@]}"
  report=$(printf 'Kemdia — %d problème(s) sur le serveur :\n' "${#problems[@]}"
    printf -- '- %s\n' "${problems[@]}")
fi
printf 'date=%s\nresultat=%s\n' "$(date -u +%FT%TZ)" "$result" >"$STATUS.tmp"
printf '%s\n' "${problems[@]}" | sed 's/^/probleme=/' | grep -v '^probleme=$' >>"$STATUS.tmp" || true
chmod 644 "$STATUS.tmp"
mv "$STATUS.tmp" "$STATUS"

if [[ -n $HC_PING_URL ]]; then
  url=$HC_PING_URL
  [[ $result == ok ]] || url="$HC_PING_URL/fail"
  # Adresse passée par l'entrée de configuration de curl : elle n'apparaît pas dans la liste des processus
  printf 'url = "%s"\n' "$url" |
    curl -fsS -o /dev/null --max-time 10 --retry 3 --data-binary "$report" -K - ||
    log "Healthchecks injoignable (il alertera de lui-même faute de nouvelles)"
else
  log "HC_PING_URL absent de $CONF : aucune alerte envoyée (voir le guide de déploiement)"
fi

[[ $result == ok ]] || die "$report"
log "✅ $report"
