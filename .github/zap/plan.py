#!/usr/bin/env python3
"""Plan OWASP ZAP (Automation Framework) du test d'intrusion de Kemdia (S7-T07, ADR-0046).

    python3 .github/zap/plan.py --mode passif|actif --cible site|api --role anonyme|client|vendeur|equipe \
        --url URL --rapports DOSSIER [--openapi FICHIER] > plan.yaml

- site : exploration (spider) depuis l'accueil, à travers Caddy, comme un visiteur ;
- api  : chaque route du document OpenAPI (docs/api/openapi.json), appelée directement ;
- rôle : la session de test est ajoutée à chaque requête par ZAP lui-même, à partir des variables d'environnement
  ZAP_AUTH_HEADER / ZAP_AUTH_HEADER_VALUE / ZAP_AUTH_HEADER_SITE (cookie du site ou « Authorization: Bearer » de l'API).
  Le JETON n'est donc jamais écrit dans le plan ni dans les rapports (vérifié en local avec ZAP 2.17.0). Une règle
  « replacer » du plan, elle, n'interprète pas les variables d'environnement.
- actif : en plus de l'analyse passive, attaques (injections, XSS, traversée de chemin…).

Seuil : risque MOYEN ou ÉLEVÉ → code de sortie 1 (CI rouge). Les exceptions sont dans EXCEPTIONS ci-dessous,
chacune justifiée : une exception se relit dans la PR comme du code.
"""

import argparse
import json

# Routes jamais visitées ni attaquées : elles fermeraient la session du scan ou changeraient l'accès du compte de test.
# Le scan actif essaie des valeurs fausses : sur les routes à essais comptés, 3 erreurs ferment la session du scan
# (relecture S7-T07). La CI revérifie de toute façon les sessions APRÈS le scan.
EXCLUSIONS = [
    r".*/api/v1/auth/logout.*",
    r".*/api/v1/auth/2fa.*",
    r".*/api/v1/auth/password/.*",
    r".*/api/v1/auth/signup.*",
    r".*/api/v1/admin/accounts/.*/roles/.*",
    r".*/deconnexion.*",
]

# Faux positifs et risques acceptés : chacun JUSTIFIÉ ici (relu en PR comme du code) et dans le rapport du test
# d'intrusion. « cible » : site ou api ; « url » : expression régulière ; « risque » : nouveau niveau dans ZAP.
EXCEPTIONS: list[dict] = [
    {
        "ruleId": 10055,  # CSP: style-src unsafe-inline
        "cible": "site",
        "url": ".*",
        "risque": "Info",
        "raison": "Risque accepté (choix du 2026-10-09, ADR-0021) : React écrit des attributs style=\"…\" (barres, "
        "carrousel, notes) qu'aucun nonce ne couvre ; un style injecté n'exécute pas de code, les scripts restent "
        "verrouillés par nonce et 'strict-dynamic'.",
    },
    {
        "ruleId": 10202,  # Absence of Anti-CSRF Tokens
        "cible": "site",
        "url": ".*",
        # « Info » et non « False Positive » : dans ZAP, faux positif change la CONFIANCE, pas le risque (le seuil le
        # compterait encore)
        "risque": "Info",
        "raison": "Faux positif : les formulaires sont des actions serveur de Next.js, protégées par la vérification "
        "de l'en-tête Origin / Sec-Fetch-Site (proxy.ts, ADR-0021) et des cookies SameSite=Lax, méthode admise par "
        "OWASP ASVS 5.0 V3.5.1 ; ZAP ne reconnaît que les jetons cachés dans les formulaires.",
    },
]

def plan(args: argparse.Namespace) -> dict:
    name = f"kemdia-{args.cible}-{args.role}"
    context = {
        "name": name,
        "urls": [args.url],
        "includePaths": [args.url.rstrip("/") + "/.*"],
        "excludePaths": EXCLUSIONS,
    }
    jobs: list[dict] = []

    # Filtres d'alertes AVANT l'exploration : ZAP ne les applique qu'aux alertes levées après eux
    exceptions = [e for e in EXCEPTIONS if e["cible"] == args.cible]
    if exceptions:
        jobs.append({
            "type": "alertFilter",
            "alertFilters": [
                {"ruleId": e["ruleId"], "newRisk": e["risque"], "url": e["url"], "urlRegex": True}
                for e in exceptions
            ],
        })

    jobs.append({"type": "passiveScan-config", "parameters": {"maxAlertsPerRule": 10, "scanOnlyInScope": True}})

    if args.cible == "api":
        jobs.append({
            "type": "openapi",
            "parameters": {"apiFile": args.openapi, "targetUrl": args.url.rstrip("/"), "context": name},
        })
    else:
        jobs.append({
            "type": "spider",
            "parameters": {
                "context": name,
                "url": args.url,
                "maxDuration": 3 if args.mode == "passif" else 8,
                "maxChildren": 15,  # catalogue : quelques produits par catégorie suffisent
                "logoutAvoidance": True,
                "postForm": False,  # jamais de formulaire envoyé par l'exploration (déconnexion, commande…)
                "processForm": False,
                "parseRobotsTxt": True,
                "parseSitemapXml": True,
            },
        })

    jobs.append({"type": "passiveScan-wait", "parameters": {"maxDuration": 5}})

    if args.mode == "actif":
        jobs.append({
            "type": "activeScan",
            "parameters": {
                "context": name,
                "maxRuleDurationInMins": 3,
                "maxScanDurationInMins": 25,
                "threadPerHost": 4,
                "handleAntiCSRFTokens": True,
            },
            "policyDefinition": {"defaultStrength": "medium", "defaultThreshold": "medium"},
        })

    for template, suffix in (("traditional-json", "json"), ("traditional-html", "html")):
        jobs.append({
            "type": "report",
            "parameters": {
                "template": template,
                "reportDir": args.rapports,
                "reportFile": f"{name}.{suffix}",
                "reportTitle": f"Kemdia — test d'intrusion ({args.mode}, {args.cible}, {args.role})",
            },
            # Sans le niveau « info » : il peut recopier des valeurs (cookies) en guise de preuve (relecture S7-T07)
            "risks": ["high", "medium", "low"],
        })

    jobs.append({
        "type": "exitStatus",
        "parameters": {"errorLevel": "Medium", "warnLevel": "Low", "okExitValue": 0, "warnExitValue": 0,
                       "errorExitValue": 1},
    })

    return {
        "env": {
            "contexts": [context],
            "parameters": {"failOnError": True, "failOnWarning": False, "progressToStdout": True},
        },
        "jobs": jobs,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--mode", choices=["passif", "actif"], required=True)
    parser.add_argument("--cible", choices=["site", "api"], required=True)
    parser.add_argument("--role", choices=["anonyme", "client", "vendeur", "equipe"], required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--rapports", required=True)
    parser.add_argument("--openapi")
    args = parser.parse_args()
    if args.cible == "api" and not args.openapi:
        parser.error("--openapi est obligatoire pour la cible api")
    # JSON est du YAML valide : aucune dépendance à installer
    print(json.dumps(plan(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
