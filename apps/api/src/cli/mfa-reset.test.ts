import { describe, expect, it, vi } from "vitest";
import { IdentityError } from "../modules/identity/index.js";
import { runMfaReset, type MfaResetService } from "./mfa-reset.js";

const ID = "22222222-2222-4222-8222-222222222222";

function harness(service: MfaResetService) {
  const out: string[] = [];
  const err: string[] = [];
  const close = vi.fn(() => Promise.resolve());
  const run = (argv: string[]) =>
    runMfaReset({
      argv,
      env: { LOG_LEVEL: "silent" },
      log: (m) => out.push(m),
      error: (m) => err.push(m),
      openService: () => Promise.resolve({ service, close }),
    });
  return { run, out, err, close };
}

describe("Commande mfa-reset (S6-T03)", () => {
  it("remet à zéro : code 0, seul l'UUID du compte est affiché", async () => {
    const reset = vi.fn(() => Promise.resolve({ accountId: ID, changed: true }));
    const h = harness({ resetFromServer: reset });
    await expect(h.run(["awa@exemple.ga"])).resolves.toBe(0);
    expect(reset).toHaveBeenCalledWith("awa@exemple.ga");
    expect(h.out.join()).toContain(ID);
    expect(h.out.join()).not.toContain("awa@exemple.ga");
    expect(h.close).toHaveBeenCalled();
  });

  it("rien à remettre à zéro : code 0 ; compte inconnu : code 1 ; mauvais usage : code 2", async () => {
    const none = harness({
      resetFromServer: () => Promise.resolve({ accountId: ID, changed: false }),
    });
    await expect(none.run(["awa@exemple.ga"])).resolves.toBe(0);
    expect(none.out.join()).toContain("Rien à faire");
    const unknown = harness({
      resetFromServer: () => Promise.reject(new IdentityError("COMPTE_INTROUVABLE", "aucun")),
    });
    await expect(unknown.run(["x@exemple.ga"])).resolves.toBe(1);
    expect(unknown.err.join()).toContain("COMPTE_INTROUVABLE");
    expect(unknown.close).toHaveBeenCalled();
    const usage = harness({ resetFromServer: vi.fn() });
    await expect(usage.run([])).resolves.toBe(2);
    await expect(usage.run(["a", "b"])).resolves.toBe(2);
  });

  it("n'affiche jamais le détail d'une erreur technique", async () => {
    const h = harness({
      resetFromServer: () => Promise.reject(new Error("postgresql://secret@db/kemdia")),
    });
    await expect(h.run(["awa@exemple.ga"])).resolves.toBe(1);
    expect(h.err.join()).not.toContain("secret");
  });

  it("échec au démarrage (base, module) : message clair, code 1, jamais de sortie silencieuse", async () => {
    const err: string[] = [];
    const code = await runMfaReset({
      argv: ["awa@exemple.ga"],
      env: { LOG_LEVEL: "silent" },
      log: () => {},
      error: (m) => err.push(m),
      openService: () => Promise.reject(new Error("postgresql://u:secret@hote/base")),
    });
    expect(code).toBe(1);
    expect(err.join()).toMatch(/Échec au démarrage : Error \(<adresse masquée>\)/);
    expect(err.join()).not.toContain("secret");
  });
});
