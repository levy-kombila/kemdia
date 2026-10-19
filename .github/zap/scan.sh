#!/usr/bin/env bash
# =============================================================================
# scan.sh — test d'intrusion OWASP ZAP de Kemdia dans la CI (S7-T07, ADR-0046).
#
#   .github/zap/scan.sh <passif|actif> <site|api> <url> <dossier des rapports>
#
# Lance ZAP (déjà installé dans $ZAP_DIR) une fois par rôle : anonyme, client, vendeur, équipe (en même temps pour le
# scan passif). Les jetons des sessions de test sont lus dans $ZAP_TOKENS_FILE (« rôle=jeton », hors du dépôt) et
# passés à ZAP par ses variables d'environnement : ni dans le plan, ni dans les rapports, ni dans la liste des processus de la CI.
# Résumé dans $GITHUB_STEP_SUMMARY ; une annotation par alerte moyenne ou élevée ; code 1 si l'une d'elles existe.
# =============================================================================
set -Eeuo pipefail

MODE=${1:?mode}
CIBLE=${2:?cible}
URL=${3:?url}
OUT=${4:?dossier des rapports}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
: "${ZAP_DIR:?ZAP_DIR : dossier de ZAP}"
: "${ZAP_TOKENS_FILE:?ZAP_TOKENS_FILE : fichier des jetons de test}"
[[ $MODE =~ ^(passif|actif)$ && $CIBLE =~ ^(site|api)$ ]] || {
  echo "usage : scan.sh <passif|actif> <site|api> <url> <dossier>" >&2
  exit 2
}
mkdir -p "$OUT"
host=$(sed -E 's#^https?://([^/:]+).*#\1#' <<<"$URL")

token_of() { sed -n "s/^$1=//p" "$ZAP_TOKENS_FILE"; }

ROLES=(anonyme client vendeur equipe)
for role in "${ROLES[@]:1}"; do
  [[ -n $(token_of "$role") ]] || {
    echo "::error::jeton de test absent pour $role"
    exit 1
  }
done

# Un passage de ZAP pour un rôle. Port du proxy propre à chaque passage (ZAP l'ouvre même en ligne de commande) et
# dossier de travail neuf (ZAP garde sinon ses réglages d'un passage à l'autre).
run_role() {
  local role=$1 port=$2 plan home token
  plan=$(mktemp --suffix=.yaml)
  local args=(--mode "$MODE" --cible "$CIBLE" --role "$role" --url "$URL" --rapports "$OUT")
  [[ $CIBLE == api ]] && args+=(--openapi "$ROOT/docs/api/openapi.json")
  # Échec du plan = échec du rôle, explicitement (relecture S7.5-T01 : « || true » à l'appel neutralise set -e ici)
  if ! python3 "$HERE/plan.py" "${args[@]}" >"$plan" 2>"$OUT/zap-$CIBLE-$role.log"; then
    echo "plan" >"$OUT/zap-$CIBLE-$role.code"
    rm -f "$plan"
    return 1
  fi

  local auth=()
  if [[ $role != anonyme ]]; then
    token=$(token_of "$role")
    if [[ $CIBLE == site ]]; then
      auth=(ZAP_AUTH_HEADER=Cookie "ZAP_AUTH_HEADER_VALUE=__Host-kemdia_session=$token")
    else
      auth=(ZAP_AUTH_HEADER=Authorization "ZAP_AUTH_HEADER_VALUE=Bearer $token")
    fi
    auth+=("ZAP_AUTH_HEADER_SITE=$host")
  fi

  home=$(mktemp -d)
  local code=0
  # Mémoire de Java bornée (relecture S7.5-T01) : 4 ZAP en même temps ne doivent pas affamer la pile testée
  env "${auth[@]}" "$ZAP_DIR/zap.sh" "$XMX" -cmd -silent -port "$port" -dir "$home" -autorun "$plan" \
    >"$OUT/zap-$CIBLE-$role.log" 2>&1 || code=$?
  rm -rf "$home" "$plan"
  echo "$code" >"$OUT/zap-$CIBLE-$role.code"
}

# Scan passif (chaque PR) : les 4 rôles EN MÊME TEMPS (S7.5-T01) — l'exploration de chacun dure jusqu'à 3 min, et
# les rapports restent séparés. Scan actif (dimanche) : un rôle après l'autre, pour ne pas surcharger la pile.
port=8091
if [[ $MODE == passif ]]; then
  XMX=-Xmx1g
  pids=()
  for role in "${ROLES[@]}"; do
    run_role "$role" "$port" &
    pids+=($!)
    port=$((port + 1))
  done
  for pid in "${pids[@]}"; do wait "$pid" || true; done
else
  XMX=-Xmx4g
  for role in "${ROLES[@]}"; do
    run_role "$role" "$port" || true
  done
fi

status=0
for role in "${ROLES[@]}"; do
  echo "::group::ZAP $MODE — $CIBLE — $role"
  code=$(cat "$OUT/zap-$CIBLE-$role.code" 2>/dev/null || echo inconnu)
  echo "code de sortie de ZAP : $code"
  tail -n 15 "$OUT/zap-$CIBLE-$role.log" 2>/dev/null || true
  echo "::endgroup::"

  report="$OUT/kemdia-$CIBLE-$role.json"
  if [[ ! -s $report ]]; then
    # Dernières lignes du journal de ZAP dans l'annotation (lisible sans télécharger les rapports)
    last=$({ grep -v '^\s*$' "$OUT/zap-$CIBLE-$role.log" 2>/dev/null || true; } | tail -n 4 | tr '\n' ' ' | cut -c1-400)
    echo "::error::ZAP n'a produit aucun rapport ($CIBLE, $role) : $last"
    status=1
    continue
  fi
  # Résumé et annotations : nom de l'alerte, risque, nombre d'adresses (jamais le contenu des requêtes)
  if python3 - "$report" "$CIBLE" "$role" "$MODE" <<'PY'
import json, os, sys
report, cible, role, mode = sys.argv[1:5]
alerts = [a for s in json.load(open(report)).get("site", []) for a in s.get("alerts", [])]
order = {"3": "Élevé", "2": "Moyen", "1": "Faible", "0": "Info"}
counts = {k: 0 for k in order}
for a in alerts:
    counts[a["riskcode"]] = counts.get(a["riskcode"], 0) + 1
lines = [f"### ZAP {mode} — {cible} — {role}", "",
         " · ".join(f"{order[k]} : {counts[k]}" for k in order), ""]
blocking = [a for a in alerts if a["riskcode"] in ("2", "3")]
if alerts:
    lines += ["| Risque | Règle | Alerte | Adresses |", "| --- | --- | --- | --- |"]
    for a in sorted(alerts, key=lambda a: -int(a["riskcode"])):
        lines.append(f"| {order[a['riskcode']]} | {a['pluginid']} | {a['name']} | {len(a.get('instances', []))} |")
lines.append("")
with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as f:
    f.write("\n".join(lines) + "\n")
for a in blocking:
    urls = ", ".join(sorted({i.get("uri", "") for i in a.get("instances", [])})[:3])
    print(f"::error title=ZAP {cible} {role}::{order[a['riskcode']]} — {a['name']} (règle {a['pluginid']}) : {urls}")
sys.exit(1 if blocking else 0)
PY
  then
    # Aucune alerte bloquante : ZAP doit alors être sorti avec 0. Un autre code (plan en échec, Java tué faute de
    # mémoire…) donnerait un rapport partiel, donc un faux vert (relecture S7.5-T01)
    if [[ $code != 0 ]]; then
      echo "::error::ZAP ($CIBLE, $role) s'est arrêté avec le code $code sans alerte bloquante : scan incomplet"
      status=1
    fi
  else
    status=1
  fi
done
exit "$status"
