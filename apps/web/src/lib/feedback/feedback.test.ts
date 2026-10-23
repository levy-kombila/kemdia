import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { checkProblem, pageFrom } = await import("./messages");
const { createFeedbackApi } = await import("./api-feedback");

const TOKEN = "a".repeat(43);

describe("Signaler un problème (S8-T02)", () => {
  it("page : chemin du site seulement, sans paramètres", () => {
    expect(pageFrom("/panier?code=1#x")).toBe("/panier");
    expect(pageFrom("//pirate.example")).toBeNull();
    expect(pageFrom("https://pirate.example")).toBeNull();
    expect(pageFrom("/\\pirate")).toBeNull();
    expect(pageFrom(null)).toBeNull();
  });

  it("vérifie le genre et la longueur de la description", () => {
    expect(checkProblem("bug", "  Le panier se vide.  ")).toEqual({
      ok: true,
      category: "bug",
      message: "Le panier se vide.",
    });
    expect(checkProblem("inconnu", "Le panier se vide.").ok).toBe(false);
    expect(checkProblem("bug", "court").ok).toBe(false);
  });

  it("envoie la session, la clé interne et le navigateur ; une erreur métier garde son code", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const h = init?.headers as Record<string, string>;
      expect(h.authorization).toBe(`Bearer ${TOKEN}`);
      expect(h["x-kemdia-user-agent"]).toBe("Mozilla/5.0");
      return new Response(
        JSON.stringify({
          type: "about:blank",
          title: "x",
          status: 429,
          code: "TROP_DE_SIGNALEMENTS",
        }),
        { status: 429, headers: { "content-type": "application/problem+json" } },
      );
    });
    const api = createFeedbackApi({ url: "http://api", key: "k", timeoutMs: 1000, fetch });
    await expect(
      api.report(
        TOKEN,
        { category: "bug", message: "Le panier se vide.", page: null },
        "Mozilla/5.0",
      ),
    ).resolves.toEqual({ ok: false, code: "TROP_DE_SIGNALEMENTS" });
    // Jeton mal formé : rien n'est envoyé
    await expect(
      api.report("x", { category: "bug", message: "Le panier se vide.", page: null }, null),
    ).resolves.toEqual({ ok: false, code: "SESSION_INVALIDE" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
