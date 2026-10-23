import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrivacyApi } from "./api-privacy";
import { deletionErrorMessage } from "./messages";

vi.mock("server-only", () => ({}));

const KEY = "k".repeat(40);
const TOKEN = "T".repeat(43);
const EXPORT = {
  format: "kemdia-donnees-personnelles/1",
  generatedAt: "2026-10-19T10:00:00.000Z",
  identite: { compte: { id: "x" } },
  commandes: { commandes: [] },
  paiements: { paiements: [] },
  livraisons: { livraisons: [] },
  boutique: { boutique: null },
  journal: { evenements: [] },
  avis: [],
};

function api(response: Response | Error) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  );
  return {
    fetch,
    privacy: createPrivacyApi({ url: "http://api:4000", key: KEY, timeoutMs: 1000, fetch }),
  };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const problem = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { type: "about:blank", title: "Erreur", status, code }, headers);

afterEach(() => vi.restoreAllMocks());

describe("adaptateur API des données personnelles (S7-T08)", () => {
  it("copie : jeton et clé interne, réponse vérifiée par le contrat", async () => {
    const { fetch, privacy } = api(json(200, EXPORT));
    expect(await privacy.exportData(TOKEN)).toEqual({ ok: true, data: EXPORT });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://api:4000/api/v1/account/data");
    expect(init?.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "x-kemdia-internal-key": KEY,
    });
    expect(init?.cache).toBe("no-store");
  });

  it("copie non conforme au contrat : INDISPONIBLE", async () => {
    const { privacy } = api(json(200, { ...EXPORT, format: "autre" }));
    expect(await privacy.exportData(TOKEN)).toEqual({ ok: false, code: "INDISPONIBLE" });
  });

  it("suppression : mot de passe et case envoyés ; 204 ; empêchement et blocage avec délai", async () => {
    const ok = api(new Response(null, { status: 204 }));
    expect(await ok.privacy.deleteAccount(TOKEN, "secret")).toEqual({
      ok: true,
      data: undefined,
    });
    const [url, init] = ok.fetch.mock.calls[0]!;
    expect(url).toBe("http://api:4000/api/v1/account/delete");
    expect(JSON.parse(init?.body as string)).toEqual({ password: "secret", confirm: true });

    const blocked = api(problem(409, "COMMANDE_EN_COURS"));
    expect(await blocked.privacy.deleteAccount(TOKEN, "secret")).toEqual({
      ok: false,
      code: "COMMANDE_EN_COURS",
    });
    const locked = api(problem(429, "COMPTE_BLOQUE", { "retry-after": "840" }));
    expect(await locked.privacy.deleteAccount(TOKEN, "secret")).toEqual({
      ok: false,
      code: "COMPTE_BLOQUE",
      retryAfterSeconds: 840,
    });
  });

  it("jeton mal formé : jamais envoyé ; API injoignable : INDISPONIBLE", async () => {
    const { fetch, privacy } = api(new Error("réseau"));
    expect(await privacy.deletionStatus("court")).toEqual({ ok: false, code: "SESSION_INVALIDE" });
    expect(fetch).not.toHaveBeenCalled();
    expect(await privacy.deletionStatus(TOKEN)).toEqual({ ok: false, code: "INDISPONIBLE" });
  });

  it("messages en français", () => {
    expect(deletionErrorMessage("BOUTIQUE_OUVERTE")).toMatch(/boutique/);
    expect(deletionErrorMessage("COMPTE_BLOQUE", 840)).toBe(
      "Trop d'essais : réessayez dans 14 min.",
    );
    expect(deletionErrorMessage("MOT_DE_PASSE_INCORRECT")).toBe("Mot de passe incorrect.");
  });
});
