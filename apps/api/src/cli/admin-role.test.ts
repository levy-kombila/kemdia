import { describe, expect, it, vi } from "vitest";
import { IdentityError } from "../modules/identity/index.js";
import { runAdminRole, type AdminRoleService } from "./admin-role.js";

const ID = "22222222-2222-4222-8222-222222222222";

function harness(service: Partial<AdminRoleService>) {
  const out: string[] = [];
  const err: string[] = [];
  const close = vi.fn(() => Promise.resolve());
  const run = (argv: string[], env: NodeJS.ProcessEnv = { LOG_LEVEL: "silent" }) =>
    runAdminRole({
      argv,
      env,
      log: (m) => out.push(m),
      error: (m) => err.push(m),
      openService: () => Promise.resolve({ service: service as AdminRoleService, close }),
    });
  return { run, out, err, close };
}

describe("Commande admin-role (premier administrateur, S4-T06)", () => {
  it("accorde le rôle : code 0, seul l'UUID du compte est affiché", async () => {
    const grant = vi.fn(() => Promise.resolve({ accountId: ID, changed: true }));
    const h = harness({ grantAdminFromServer: grant });
    await expect(h.run(["grant", "awa@exemple.ga"])).resolves.toBe(0);
    expect(grant).toHaveBeenCalledWith("awa@exemple.ga");
    expect(h.out.join()).toContain(ID);
    expect(h.out.join()).not.toContain("awa@exemple.ga");
    expect(h.close).toHaveBeenCalled();
  });

  it("déjà administrateur : rien à faire, code 0", async () => {
    const h = harness({
      grantAdminFromServer: () => Promise.resolve({ accountId: ID, changed: false }),
    });
    await expect(h.run(["grant", "awa@exemple.ga"])).resolves.toBe(0);
    expect(h.out.join()).toContain("Rien à faire");
  });

  it("refus métier (compte inconnu, non vérifié) : code 1, message clair", async () => {
    const h = harness({
      revokeAdminFromServer: () =>
        Promise.reject(new IdentityError("COMPTE_INTROUVABLE", "aucun compte ne correspond")),
    });
    await expect(h.run(["revoke", "x@exemple.ga"])).resolves.toBe(1);
    expect(h.err.join()).toContain("COMPTE_INTROUVABLE");
    expect(h.close).toHaveBeenCalled();
  });

  it("erreur technique : jamais le détail (il pourrait contenir l'adresse de la base)", async () => {
    const h = harness({
      grantAdminFromServer: () =>
        Promise.reject(new Error("connect postgresql://kemdia:secret@db/kemdia")),
    });
    await expect(h.run(["grant", "awa@exemple.ga"])).resolves.toBe(1);
    expect(h.err.join()).not.toContain("secret");
  });

  it("mauvais usage ou configuration fausse : refus avant toute connexion", async () => {
    const h = harness({});
    await expect(h.run([])).resolves.toBe(2);
    await expect(h.run(["delete", "awa@exemple.ga"])).resolves.toBe(2);
    await expect(h.run(["grant", "a@b.ga", "en-trop"])).resolves.toBe(2);
    await expect(h.run(["grant", "a@b.ga"], { DATABASE_URL: "mysql://x" })).resolves.toBe(1);
    expect(h.close).not.toHaveBeenCalled();
  });
});
