import { describe, expect, it, vi } from "vitest";
import { createSandboxApi } from "./api-sandbox";
import { sandboxMessage } from "./sandbox-messages";

const KEY = "k".repeat(40);
const TOKEN = "T".repeat(43);
const PAYMENT = "11111111-1111-4111-8111-111111111111";
const REQUEST = {
  paymentId: PAYMENT,
  orderReference: "KMD-ABCDEF",
  method: "airtel",
  amount: 12_500,
  phone: "+241077123456",
  createdAt: "2026-10-11T10:00:00.000Z",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const problem = (status: number, code?: string) =>
  json(status, { type: "about:blank", title: "Erreur", status, ...(code ? { code } : {}) });

function api(response: Response | Error) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  );
  return {
    fetch,
    sandbox: createSandboxApi({
      url: "http://serveur.test:4000",
      key: KEY,
      timeoutMs: 1000,
      fetch,
    }),
  };
}

describe("Téléphone simulé : adaptateur de l'API (S5-T05)", () => {
  it("liste : jeton de session et clé interne envoyés, réponse vérifiée par le contrat", async () => {
    const { fetch, sandbox } = api(json(200, { items: [REQUEST] }));
    await expect(sandbox.list(TOKEN)).resolves.toEqual({ ok: true, data: { items: [REQUEST] } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://serveur.test:4000/api/v1/sandbox/mobile-money/requests");
    expect(init?.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "x-kemdia-internal-key": KEY,
    });
  });

  it("décision : corps envoyé (code PIN seulement pour valider)", async () => {
    const { fetch, sandbox } = api(json(200, { status: "succeeded", failureReason: null }));
    await sandbox.decide(TOKEN, PAYMENT, "approve", "1234");
    expect(fetch.mock.calls[0]![0]).toBe(
      `http://serveur.test:4000/api/v1/sandbox/mobile-money/requests/${PAYMENT}`,
    );
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({
      decision: "approve",
      pin: "1234",
    });
    const second = api(json(200, { status: "failed", failureReason: "refuse_par_le_client" }));
    await second.sandbox.decide(TOKEN, PAYMENT, "decline");
    expect(JSON.parse(second.fetch.mock.calls[0]![1]!.body as string)).toEqual({
      decision: "decline",
    });
  });

  it("erreurs : code métier, bac à sable fermé (404 sans code), réponse non conforme, API injoignable", async () => {
    expect(await api(problem(404, "DEMANDE_INTROUVABLE")).sandbox.list(TOKEN)).toEqual({
      ok: false,
      code: "DEMANDE_INTROUVABLE",
    });
    expect(await api(problem(404)).sandbox.list(TOKEN)).toEqual({
      ok: false,
      code: "BAC_A_SABLE_FERME",
    });
    expect(await api(json(200, { items: [{ bonjour: 1 }] })).sandbox.list(TOKEN)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    expect(await api(new Error("réseau")).sandbox.list(TOKEN)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
  });

  it("jeton mal formé : rien n'est envoyé", async () => {
    const { fetch, sandbox } = api(json(200, { items: [] }));
    expect(await sandbox.list("pas un jeton")).toEqual({ ok: false, code: "SESSION_INVALIDE" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("chaque refus a un message en français", () => {
    expect(sandboxMessage("CODE_PIN_INVALIDE")).toMatch(/4 chiffres/);
    expect(sandboxMessage("BAC_A_SABLE_FERME")).toMatch(/n'existe pas/);
  });
});
