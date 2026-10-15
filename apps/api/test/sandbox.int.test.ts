import "reflect-metadata";
import type { AddressInfo } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  OrderQuoteSchema,
  OrderSchema,
  PaymentNotificationAckSchema,
  PaymentSchema,
  ProblemDetailsSchema,
  SandboxDecisionSchema,
  SandboxPaymentRequestPageSchema,
  type Order,
  type Payment,
} from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { configureApp } from "../src/http/configure-app.js";
import {
  importCatalog,
  prepareDemoCatalog,
} from "../src/modules/catalog/infrastructure/demo-catalog.js";
import { PrismaCategoryRepository } from "../src/modules/catalog/infrastructure/prisma-category.repository.js";
import { PrismaProductRepository } from "../src/modules/catalog/infrastructure/prisma-product.repository.js";
import { SessionService } from "../src/modules/identity/index.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import { WEBHOOK_KEY, type WebhookKey } from "../src/modules/payments/application/ports.js";
import { signNotification } from "../src/modules/payments/domain/webhook-signature.js";
import {
  SANDBOX_OPERATOR,
  type SandboxOperator,
} from "../src/modules/payments/infrastructure/sandbox-operator.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Bac à sable Mobile Money sur une VRAIE base, par VRAI HTTP (S5-T05, ADR-0027) : téléphone simulé, notification
 * signée envoyée par l'opérateur simulé à l'API qui écoute, signature, fenêtre de 5 minutes, rejeu ignoré.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");
const WEBHOOK = "/api/v1/webhooks/mobile-money";

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;
const newPhone = () => `07${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
const ADDRESS = {
  fullName: "Marie Nze",
  phone: "077 12 34 56",
  cityId: "libreville",
  neighborhood: "Glass",
  landmark: "Portail bleu face à la pharmacie",
};

describe("Bac à sable Mobile Money (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let operator: SandboxOperator;
  let key: WebhookKey;
  let client = { token: "", accountId: "" };
  let variantId = "";

  const call = (method: "get" | "post", url: string, token: string) => {
    const server = request(app.getHttpServer());
    return (method === "get" ? server.get(url) : server.post(url))
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
      .set("Authorization", `Bearer ${token}`);
  };
  const placeOrderAndPay = async (
    token = client.token,
  ): Promise<{ order: Order; payment: Payment }> => {
    await call("post", "/api/v1/cart/items", token).send({ variantId, quantity: 1 }).expect(200);
    const q = matches(
      OrderQuoteSchema,
      (await call("post", "/api/v1/orders/quote", token).send({ cityId: "libreville" }).expect(200))
        .body,
    );
    const order = matches(
      OrderSchema,
      (
        await call("post", "/api/v1/orders", token)
          .send({
            idempotencyKey: randomUUID(),
            expectedTotal: q.total,
            delivery: ADDRESS,
            payment: { method: "airtel", phone: newPhone() },
          })
          .expect(201)
      ).body,
    );
    const payment = matches(
      PaymentSchema,
      (await call("post", `/api/v1/orders/${order.reference}/payments`, token).send({}).expect(201))
        .body,
    );
    placed.push({ reference: order.reference, token });
    return { order, payment };
  };
  /** Commandes passées : celles encore en attente sont annulées à la fin (stock rendu, pas de reste pour les autres tests). */
  const placed: { reference: string; token: string }[] = [];
  const signed = (body: string, at = Math.floor(Date.now() / 1000), secret = key.secret!) =>
    request(app.getHttpServer())
      .post(WEBHOOK)
      .set("content-type", "application/json")
      .set("x-kemdia-signature", signNotification(secret, at, body))
      .send(body);
  const notification = (payment: Payment, over: Record<string, unknown> = {}) =>
    JSON.stringify({
      eventId: randomUUID(),
      type: "payment.succeeded",
      paymentId: payment.id,
      providerRef: providerRefOf(payment),
      amount: payment.amount,
      currency: "XAF",
      occurredAt: new Date().toISOString(),
      ...over,
    });
  let refs = new Map<string, string>();
  const providerRefOf = (payment: Payment) => refs.get(payment.id)!;

  async function openSession(): Promise<{ token: string; accountId: string }> {
    const email = `bac.${randomUUID()}@exemple.ga`;
    const now = new Date();
    const account = Account.register({
      id: randomUUID(),
      firstName: "Awa",
      lastName: "Ndong",
      identifier: requireIdentifier(email),
      passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c2Vs$aGFjaGFnZQ",
      now,
    });
    account.markVerified(requireIdentifier(email), now);
    await new PrismaAccountRepository(prisma).save(account);
    const opened = await app.get(SessionService).open(account);
    return { token: opened.token, accountId: account.id };
  }

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: testDatabaseUrl(),
      API_INTERNAL_KEY: INTERNAL_KEY,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as AddressInfo;
    prisma = app.get(PrismaService);
    operator = app.get<SandboxOperator>(SANDBOX_OPERATOR);
    operator.webhookUrl = `http://127.0.0.1:${port}${WEBHOOK}`;
    key = app.get<WebhookKey>(WEBHOOK_KEY);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "catalog"."product_variants", "catalog"."products", "catalog"."categories" CASCADE',
    );
    await importCatalog(prepareDemoCatalog(demoCatalog), {
      categories: new PrismaCategoryRepository(prisma),
      products: new PrismaProductRepository(prisma),
    });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE "catalog"."product_variants" SET "stock" = 50, "is_active" = true, "compare_at_price" = NULL`,
    );
    await prisma.$executeRawUnsafe(`UPDATE "catalog"."products" SET "status" = 'PUBLISHED'`);
    variantId = (
      await prisma.productVariant.findFirstOrThrow({ orderBy: [{ price: "asc" }, { sku: "asc" }] })
    ).id;
    client = await openSession();
    refs = new Map();
  });

  afterAll(async () => {
    for (const { reference, token } of placed) {
      await call("post", `/api/v1/orders/${reference}/cancel`, token);
    }
    await app.close();
  });

  const remember = async (payment: Payment) => {
    refs.set(
      payment.id,
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).providerRef!,
    );
  };

  it("téléphone simulé : la demande s'affiche, code PIN, validation → notification signée → commande payée", async () => {
    const { order, payment } = await placeOrderAndPay();
    const page = matches(
      SandboxPaymentRequestPageSchema,
      (await call("get", "/api/v1/sandbox/mobile-money/requests", client.token).expect(200)).body,
    );
    expect(page.items).toMatchObject([
      {
        paymentId: payment.id,
        orderReference: order.reference,
        amount: order.total,
        method: "airtel",
      },
    ]);
    // Un autre compte ne voit ni ne valide cette demande
    const other = await openSession();
    const otherPage = matches(
      SandboxPaymentRequestPageSchema,
      (await call("get", "/api/v1/sandbox/mobile-money/requests", other.token).expect(200)).body,
    );
    expect(otherPage.items).toEqual([]);
    const stolen = await call(
      "post",
      `/api/v1/sandbox/mobile-money/requests/${payment.id}`,
      other.token,
    )
      .send({ decision: "approve", pin: "1234" })
      .expect(404);
    expect(codeOf(stolen.body)).toBe("DEMANDE_INTROUVABLE");

    const noPin = await call(
      "post",
      `/api/v1/sandbox/mobile-money/requests/${payment.id}`,
      client.token,
    )
      .send({ decision: "approve" })
      .expect(422);
    expect(codeOf(noPin.body)).toBe("CODE_PIN_INVALIDE");
    const decision = matches(
      SandboxDecisionSchema,
      (
        await call("post", `/api/v1/sandbox/mobile-money/requests/${payment.id}`, client.token)
          .send({ decision: "approve", pin: "1234" })
          .expect(200)
      ).body,
    );
    expect(decision).toEqual({ status: "succeeded", failureReason: null });
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid).toMatchObject({ status: "CONFIRMED" });
    expect(paid.paidAt).not.toBeNull();
    expect(await prisma.providerEvent.count({ where: { paymentId: payment.id } })).toBe(1);
    // Déjà répondue : plus sur le téléphone
    await call("post", `/api/v1/sandbox/mobile-money/requests/${payment.id}`, client.token)
      .send({ decision: "approve", pin: "1234" })
      .expect(404);
  });

  it("refus sur le téléphone simulé : essai échoué, le client peut réessayer", async () => {
    const { order, payment } = await placeOrderAndPay();
    const decision = matches(
      SandboxDecisionSchema,
      (
        await call("post", `/api/v1/sandbox/mobile-money/requests/${payment.id}`, client.token)
          .send({ decision: "decline" })
          .expect(200)
      ).body,
    );
    expect(decision).toEqual({ status: "failed", failureReason: "refuse_par_le_client" });
    const latest = matches(
      PaymentSchema,
      (await call("get", `/api/v1/orders/${order.reference}/payments`, client.token).expect(200))
        .body,
    );
    expect(latest).toMatchObject({
      status: "failed",
      failureReason: "refuse_par_le_client",
      attemptsLeft: 2,
    });
  });

  it("annulation par le client : la demande en attente disparaît du téléphone, plus rien à valider (S5-T07)", async () => {
    const { order, payment } = await placeOrderAndPay();
    const inbox = async () =>
      (await call("get", "/api/v1/sandbox/mobile-money/requests", client.token).expect(200))
        .body as { items: { paymentId: string }[] };
    expect((await inbox()).items.map((i) => i.paymentId)).toContain(payment.id);
    await call("post", `/api/v1/orders/${order.reference}/cancel`, client.token).expect(200);
    // Expirée dans la transaction de l'annulation, comme pour une annulation par un administrateur
    const latest = matches(
      PaymentSchema,
      (await call("get", `/api/v1/orders/${order.reference}/payments`, client.token).expect(200))
        .body,
    );
    expect(latest).toMatchObject({ status: "expired", failureReason: "commande_annulee" });
    expect((await inbox()).items.map((i) => i.paymentId)).not.toContain(payment.id);
    const late = await call(
      "post",
      `/api/v1/sandbox/mobile-money/requests/${payment.id}`,
      client.token,
    )
      .send({ decision: "approve", pin: "1234" })
      .expect(404);
    expect(matches(ProblemDetailsSchema, late.body).code).toBe("DEMANDE_INTROUVABLE");
  });

  it("notification : signature exigée, fenêtre de 5 minutes, rejeu ignoré sans rien changer", async () => {
    const { order, payment } = await placeOrderAndPay();
    await remember(payment);
    const body = notification(payment);

    const unsigned = await request(app.getHttpServer())
      .post(WEBHOOK)
      .set("content-type", "application/json")
      .send(body)
      .expect(401);
    expect(codeOf(unsigned.body)).toBe("SIGNATURE_INVALIDE");
    expect(codeOf((await signed(body, undefined, randomBytes(32)).expect(401)).body)).toBe(
      "SIGNATURE_INVALIDE",
    );
    // Corps modifié après la signature (montant)
    const header = signNotification(key.secret!, Math.floor(Date.now() / 1000), body);
    const tampered = await request(app.getHttpServer())
      .post(WEBHOOK)
      .set("content-type", "application/json")
      .set("x-kemdia-signature", header)
      .send(body.replace(`"amount":${payment.amount}`, `"amount":${payment.amount + 1}`))
      .expect(401);
    expect(codeOf(tampered.body)).toBe("SIGNATURE_INVALIDE");
    const old = await signed(body, Math.floor(Date.now() / 1000) - 301).expect(401);
    expect(codeOf(old.body)).toBe("NOTIFICATION_EXPIREE");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "PENDING_PAYMENT",
    );

    const first = matches(PaymentNotificationAckSchema, (await signed(body).expect(200)).body);
    expect(first).toEqual({ received: true, duplicate: false });
    const replay = matches(PaymentNotificationAckSchema, (await signed(body).expect(200)).body);
    expect(replay).toEqual({ received: true, duplicate: true });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "CONFIRMED",
    );
    expect(await prisma.providerEvent.count({ where: { paymentId: payment.id } })).toBe(1);
  });

  it("notification signée mais fausse : contenu invalide (400), essai inconnu (404, rien n'est gardé), réussite sans montant (400)", async () => {
    const { payment } = await placeOrderAndPay();
    await remember(payment);
    await signed(JSON.stringify({ bonjour: true })).expect(400);
    await signed(notification(payment, { amount: undefined })).expect(400);
    await signed(notification(payment, { currency: "EUR" })).expect(400);
    const unknownId = randomUUID();
    const unknown = await signed(notification(payment, { paymentId: unknownId })).expect(404);
    expect(codeOf(unknown.body)).toBe("PAIEMENT_INTROUVABLE");
    expect(await prisma.providerEvent.count({ where: { paymentId: unknownId } })).toBe(0);
    // Autre référence d'opérateur que celle de l'essai : refusée
    const wrongRef = await signed(notification(payment, { providerRef: "SIM-AUTRE" })).expect(404);
    expect(codeOf(wrongRef.body)).toBe("PAIEMENT_INTROUVABLE");
    expect(await prisma.providerEvent.count({ where: { paymentId: payment.id } })).toBe(0);
  });

  it("la base garde les notifications en ajout seul", async () => {
    const { payment } = await placeOrderAndPay();
    await remember(payment);
    await signed(
      notification(payment, {
        type: "payment.failed",
        amount: undefined,
        failureReason: "solde_insuffisant",
      }),
    ).expect(200);
    const event = await prisma.providerEvent.findFirstOrThrow({ where: { paymentId: payment.id } });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payments"."provider_events" SET "type" = 'payment.succeeded' WHERE "id" = '${event.id}'`,
      ),
    ).rejects.toThrow(/ajout seul/);
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM "payments"."provider_events" WHERE "id" = '${event.id}'`,
      ),
    ).rejects.toThrow(/ajout seul/);
  });
});
