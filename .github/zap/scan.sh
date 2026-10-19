#!/usr/bin/env bash
# =============================================================================
# scan.sh — test d'intrusion OWASP ZAP de Kemdia dans la CI (S7-T07, ADR-0046).
#
#   .github/zap/scan.sh <passif|actif> <site|api> <url> <dossier des rapports>
#
# Lance ZAP (déjà installé dans $ZAP_DIR) une fois par rôle : anonyme, client, vendeur, équipe. Les jetons des
# sessions de test sont lus dans $ZAP_TOKENS_FILE (« rôle=jeton », hors du dépôt) et passés à ZAP par ses variables
# d'environnement : ni dans le plan, ni dans les rapports, ni dans la liste des processus de la CI.
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

status=0
for role in anonyme client vendeur equipe; do
  echo "::group::ZAP $MODE — $CIBLE — $role"
  plan=$(mktemp --suffix=.yaml)
  args=(--mode "$MODE" --cible "$CIBLE" --role "$role" --url "$URL" --rapports "$OUT")
  [[ $CIBLE == api ]] && args+=(--openapi "$ROOT/docs/api/openapi.json")
  python3 "$HERE/plan.py" "${args[@]}" >"$plan"

  auth=()
  if [[ $role != anonyme ]]; then
    token=$(token_of "$role")
    [[ -n $token ]] || {
      echo "::error::jeton de test absent pour $role"
      exit 1
    }
    if [[ $CIBLE == site ]]; then
      auth=(ZAP_AUTH_HEADER=Cookie "ZAP_AUTH_HEADER_VALUE=__Host-kemdia_session=$token")
    else
      auth=(ZAP_AUTH_HEADER=Authorization "ZAP_AUTH_HEADER_VALUE=Bearer $token")
    fi
    auth+=("ZAP_AUTH_HEADER_SITE=$host")
  fi

  # Dossier de travail neuf à chaque passage : ZAP garde sinon ses réglages d'un passage à l'autre
  home=$(mktemp -d)
  set +e
  env "${auth[@]}" "$ZAP_DIR/zap.sh" -cmd -silent -dir "$home" -autorun "$plan" >"$OUT/zap-$CIBLE-$role.log" 2>&1
  code=$?
  set -e
  rm -rf "$home" "$plan"
  echo "code de sortie de ZAP : $code"
  tail -n 15 "$OUT/zap-$CIBLE-$role.log"
  echo "::endgroup::"

  report="$OUT/kemdia-$CIBLE-$role.json"
  if [[ ! -s $report ]]; then
    # Dernières lignes du journal de ZAP dans l'annotation (lisible sans télécharger les rapports)
    last=$(grep -v '^\s*$' "$OUT/zap-$CIBLE-$role.log" | tail -n 4 | tr '\n' ' ' | cut -c1-400)
    echo "::error::ZAP n'a produit aucun rapport ($CIBLE, $role) : $last"
    status=1
    continue
  fi
  # Résumé et annotations : nom de l'alerte, risque, nombre d'adresses (jamais le contenu des requêtes)
  python3 - "$report" "$CIBLE" "$role" "$MODE" <<'PY' || status=1
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
done
exit "$status"
