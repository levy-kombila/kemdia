import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyNotification } from "../domain/webhook-signature.js";
import { sandboxEnabled } from "./payment-providers.js";
import { SandboxOperator } from "./sandbox-operator.js";

const key = { secret: new Uint8Array(randomBytes(32)) };
const request = (over: Partial<{ amount: number; accountId: string; paymentId: string }> = {}) => ({
  paymentId: "11111111-1111-4111-8111-111111111111",
  orderReference: "KMD-ABCDEF",
  amount: 12_500,
  method: "airtel" as const,
  phone: "+241077123456",
  accountId: "compte-a",
  ...over,
});

function operatorWith(statuses: number[]) {
  const operator = new SandboxOperator(key, 4000);
  const sent: { body: string; signature: string }[] = [];
  operator.send = (_url, body, headers) => {
    sent.push({ body, signature: headers["x-kemdia-signature"]! });
    return Promise.resolve(statuses.shift() ?? 200);
  };
  return { operator, sent };
}

describe("Opérateur simulé (S5-T05)", () => {
  it("validation : notification signée « payment.succeeded » avec le montant ; la demande quitte le téléphone", async () => {
    const { operator, sent } = operatorWith([200]);
    await operator.request(request());
    expect(operator.pendingFor("compte-a")).toHaveLength(1);
    expect(operator.pendingFor("compte-b")).toEqual([]);
    await expect(
      operator.decide("compte-a", request().paymentId, "approve", "1234"),
    ).resolves.toEqual({
      status: "succeeded",
      failureReason: null,
    });
    const body = JSON.parse(sent[0]!.body) as Record<string, unknown>;
    expect(body).toMatchObject({ type: "payment.succeeded", amount: 12_500, currency: "XAF" });
    expect(
      verifyNotification(
        sent[0]!.signature,
        sent[0]!.body,
        key.secret,
        Math.floor(Date.now() / 1000),
      ),
    ).toBe("ok");
    expect(operator.pendingFor("compte-a")).toEqual([]);
  });

  it("solde fictif dépassé ou refus : « payment.failed » ; code PIN obligatoire pour valider", async () => {
    const { operator, sent } = operatorWith([200, 200]);
    await operator.request(request({ amount: 600_000 }));
    await expect(
      operator.decide("compte-a", request().paymentId, "approve", "12a4"),
    ).rejects.toMatchObject({
      code: "CODE_PIN_INVALIDE",
    });
    await expect(
      operator.decide("compte-a", request().paymentId, "approve", "0000"),
    ).resolves.toEqual({
      status: "failed",
      failureReason: "solde_insuffisant",
    });
    const id = "22222222-2222-4222-8222-222222222222";
    await operator.request(request({ paymentId: id }));
    await operator.decide("compte-a", id, "decline", undefined);
    expect(JSON.parse(sent[1]!.body)).toMatchObject({
      type: "payment.failed",
      failureReason: "refuse_par_le_client",
    });
  });

  it("API injoignable : 3 envois de la MÊME notification ; tous refusés → la demande reste sur le téléphone", async () => {
    const { operator, sent } = operatorWith([503, 503, 503]);
    await operator.request(request());
    await expect(
      operator.decide("compte-a", request().paymentId, "approve", "1234"),
    ).rejects.toMatchObject({ code: "PAIEMENT_INDISPONIBLE" });
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((s) => (JSON.parse(s.body) as { eventId: string }).eventId)).size).toBe(
      1,
    );
    expect(operator.pendingFor("compte-a")).toHaveLength(1);
  });

  it("commande occupée (409) ou trop de notifications (429) : renvoyée", async () => {
    const { operator, sent } = operatorWith([409, 429, 200]);
    await operator.request(request());
    await expect(
      operator.decide("compte-a", request().paymentId, "decline", undefined),
    ).resolves.toMatchObject({ status: "failed" });
    expect(sent).toHaveLength(3);
  });

  it("10 demandes en attente au plus par compte ; une demande disparaît avec la fin de l'essai (3 min)", async () => {
    const { operator } = operatorWith([]);
    let now = Date.now();
    operator.clock = () => new Date(now);
    const id = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
    for (let n = 0; n < 10; n++) await operator.request(request({ paymentId: id(n) }));
    await expect(operator.request(request({ paymentId: id(10) }))).rejects.toThrow();
    await expect(
      operator.request(request({ paymentId: id(11), accountId: "compte-b" })),
    ).resolves.toBeDefined();
    now += 3 * 60_000 + 1;
    expect(operator.pendingFor("compte-a")).toEqual([]);
    await expect(operator.decide("compte-a", id(0), "decline", undefined)).rejects.toMatchObject({
      code: "DEMANDE_INTROUVABLE",
    });
    await expect(operator.request(request({ paymentId: id(12) }))).resolves.toBeDefined();
  });

  it("refus définitif de l'API (4xx) : pas de nouvel envoi", async () => {
    const { operator, sent } = operatorWith([404]);
    await operator.request(request());
    await expect(
      operator.decide("compte-a", request().paymentId, "decline", undefined),
    ).rejects.toThrow();
    expect(sent).toHaveLength(1);
  });

  it("demande d'un autre compte ou inconnue : introuvable", async () => {
    const { operator } = operatorWith([]);
    await operator.request(request());
    await expect(
      operator.decide("compte-b", request().paymentId, "decline", undefined),
    ).rejects.toMatchObject({
      code: "DEMANDE_INTROUVABLE",
    });
  });

  it("actif seulement sur le poste de développement, la démo et les tests", () => {
    expect(sandboxEnabled({ APP_ENV: "local", NODE_ENV: "development" })).toBe(true);
    expect(sandboxEnabled({ APP_ENV: "local", NODE_ENV: "test" })).toBe(true);
    expect(sandboxEnabled({ APP_ENV: "demo", NODE_ENV: "production" })).toBe(true);
    expect(sandboxEnabled({ APP_ENV: "local", NODE_ENV: "production" })).toBe(false);
    expect(sandboxEnabled({ APP_ENV: "staging", NODE_ENV: "production" })).toBe(false);
    expect(sandboxEnabled({ APP_ENV: "production", NODE_ENV: "production" })).toBe(false);
  });
});
