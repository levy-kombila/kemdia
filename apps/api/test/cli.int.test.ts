import { describe, expect, it } from "vitest";
import { runAdminRole } from "../src/cli/admin-role.js";
import { runMfaReset } from "../src/cli/mfa-reset.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Commandes serveur avec le VRAI contexte Nest (S4-T06, S6-T03) : jusqu'au 2026-10-16, le module de la commande
 * oubliait une dépendance du module identité (stockage des limites de débit, S4-T07) ; Nest arrêtait alors le processus
 * sans aucun message. Les tests unitaires remplaçaient ce contexte et ne pouvaient pas le voir : celui-ci le démarre.
 * Identifiant inconnu : aucune écriture, mais le contexte complet a démarré et le service a répondu.
 */
const env = { ...process.env, DATABASE_URL: testDatabaseUrl(), LOG_LEVEL: "silent" };

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, log: (m: string) => out.push(m), error: (m: string) => err.push(m) };
}

describe("commandes serveur : vrai démarrage (PostgreSQL)", () => {
  it("admin:grant démarre et répond (compte inconnu → refus clair, code 1)", async () => {
    const io = capture();
    const code = await runAdminRole({ argv: ["grant", "personne@inconnu.ga"], env, ...io });
    expect(io.err.join()).toContain("COMPTE_INTROUVABLE");
    expect(code).toBe(1);
  });

  it("mfa:reset démarre et répond (compte inconnu → refus clair, code 1)", async () => {
    const io = capture();
    const code = await runMfaReset({ argv: ["personne@inconnu.ga"], env, ...io });
    expect(io.err.join()).toContain("COMPTE_INTROUVABLE");
    expect(code).toBe(1);
  });

  it("base injoignable : le contexte démarre (connexion à la 1re requête), l'opération échoue ; jamais l'adresse", async () => {
    const io = capture();
    const secret = "motdepasse-secret";
    const code = await runAdminRole({
      argv: ["grant", "a@b.ga"],
      env: { ...env, DATABASE_URL: `postgresql://u:${secret}@127.0.0.1:9/kemdia_test` },
      ...io,
    });
    expect(code).toBe(1);
    expect(io.err.join()).toMatch(/^Échec : /);
    expect(io.err.join()).not.toContain(secret);
  }, 30_000);
});
