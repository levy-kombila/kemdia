import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  CodSettingsSchema,
  OrderQuoteSchema,
  OrderSchema,
  PaymentSchema,
  ProblemDetailsSchema,
  RefundPageSchema,
  RefundSchema,
  type Order,
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
import {
  PAYMENT_PROVIDER,
  PaymentProviderError,
  PaymentService,
  type PaymentProvider,
} from "../src/modules/payments/index.js";
import { StalePaymentsScheduler } from "../src/modules/payments/infrastructure/stale-payments.js";
import { testDatabaseUrl } from "./integration-db.js";
import { confirmSecondFactor } from "./second-factor-helper.js";

/**
 * Paiements sur une VRAIE base (S5-T04, ADR-0026), par HTTP : essais Mobile Money (3 au plus, résultat de l'opérateur),
 * paiement reçu en retard → remboursement, annulation par un administrateur, encaissement à la livraison, réglage du
 * paiement à la livraison, règles de la base. Paiements et commandes ne s'effacent jamais : comptes neufs à chaque test.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;
/** Numéro neuf à chaque commande : la limite de 5 demandes par heure et par numéro ne mêle pas les tests. */
const newPhone = (prefix: "07" | "06") =>
  `${prefix}${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
const e164 = (phone: string) => `+241${phone}`;

const ADDRESS = {
  fullName: "Marie Nze",
  phone: "077 12 34 56",
  cityId: "libreville",
  neighborhood: "Glass",
  landmark: "Portail bleu face à la pharmacie",
};

/** Fournisseur de test : accepte, ou refuse quand `down` est vrai ; garde les demandes reçues. */
class FakeProvider implements PaymentProvider {
  readonly name = "simule";
  readonly available = true;
  down = false;
  readonly requests: { paymentId: string; phone: string; amount: number }[] = [];

  request(payment: { paymentId: string; phone: string; amount: number }) {
    if (this.down) return Promise.reject(new PaymentProviderError("injoignable"));
    this.requests.push(payment);
    return Promise.resolve({ providerRef: `SIM-${payment.paymentId}` });
  }
}

describe("Paiements (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let payments: PaymentService;
  const provider = new FakeProvider();
  let admin = { token: "", accountId: "" };
  let client = { token: "", accountId: "" };
  let variants: { id: string; price: number }[] = [];

  const call = (method: "get" | "post" | "put", url: string, token: string) => {
    const server = request(app.getHttpServer());
    const req =
      method === "get" ? server.get(url) : method === "post" ? server.post(url) : server.put(url);
    return req.set("X-Kemdia-Internal-Key", INTERNAL_KEY).set("Authorization", `Bearer ${token}`);
  };
  const placeOrder = async (
    method: "airtel" | "moov" | "cod" = "airtel",
    token = client.token,
  ): Promise<Order> => {
    await call("post", "/api/v1/cart/items", token)
      .send({ variantId: variants[0]!.id, quantity: 1 })
      .expect(200);
    const q = matches(
      OrderQuoteSchema,
      (await call("post", "/api/v1/orders/quote", token).send({ cityId: "libreville" }).expect(200))
        .body,
    );
    const payment =
      method === "cod"
        ? { method }
        : { method, phone: newPhone(method === "airtel" ? "07" : "06") };
    return matches(
      OrderSchema,
      (
        await call("post", "/api/v1/orders", token)
          .send({
            idempotencyKey: randomUUID(),
            expectedTotal: q.total,
            delivery: ADDRESS,
            payment,
          })
          .expect(201)
      ).body,
    );
  };
  const startPayment = (reference: string, body: object = {}, token = client.token) =>
    call("post", `/api/v1/orders/${reference}/payments`, token).send(body);
  const orderOf = async (reference: string) =>
    prisma.order.findUniqueOrThrow({ where: { reference } });
  const stockOf = async (variantId: string) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;

  /** Résultat « payé » transmis par l'opérateur (référence notée à la demande, montant demandé par défaut). */
  const succeed = (paymentId: string, amount: number) =>
    payments.applyProviderResult({
      paymentId,
      providerRef: `SIM-${paymentId}`,
      outcome: "succeeded",
      amount,
    });

  async function openSession(role?: "ADMIN"): Promise<{ token: string; accountId: string }> {
    const email = `paiement.${randomUUID()}@exemple.ga`;
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
    if (role) await prisma.accountRole.create({ data: { accountId: account.id, role } });
    const opened = await app.get(SessionService).open(account);
    // Compte d'équipe : session confirmée par la double authentification (S6-T03)
    if (role) await confirmSecondFactor(prisma, account.id);
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
    })
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
    prisma = app.get(PrismaService);
    payments = app.get(PaymentService);
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
    variants = (
      await prisma.productVariant.findMany({
        select: { id: true, price: true },
        orderBy: [{ price: "asc" }, { sku: "asc" }],
      })
    ).map((v) => ({ id: v.id, price: v.price }));
    admin = await openSession("ADMIN");
    client = await openSession();
    provider.down = false;
    payments.clock = () => new Date();
  });

  afterEach(async () => {
    // Réglage partagé par toute la base : remis aux valeurs de départ
    await prisma.codSettings.update({
      where: { id: 1 },
      data: { zones: ["zone_1"], maxTotal: 100_000 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("Mobile Money : essai en attente, puis paiement reçu → commande confirmée (résultat reçu deux fois : rien de plus)", async () => {
    const order = await placeOrder();
    const started = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    expect(started).toMatchObject({
      orderReference: order.reference,
      method: "airtel",
      amount: order.total,
      status: "pending",
      attempt: 1,
      attemptsLeft: 2,
    });
    expect(started.phone).toMatch(/^\+24107\d{7}$/);
    expect(provider.requests.at(-1)).toMatchObject({ paymentId: started.id, amount: order.total });
    const busy = await startPayment(order.reference).expect(409);
    expect(codeOf(busy.body)).toBe("PAIEMENT_EN_COURS");

    // Sans montant, ou sans la référence notée : refusé, rien ne change
    await expect(
      payments.applyProviderResult({
        paymentId: started.id,
        providerRef: `SIM-${started.id}`,
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "PAIEMENT_INTROUVABLE" });
    await expect(
      payments.applyProviderResult({
        paymentId: started.id,
        outcome: "succeeded",
        amount: started.amount,
      }),
    ).rejects.toMatchObject({ code: "PAIEMENT_INTROUVABLE" });
    expect((await orderOf(order.reference)).status).toBe("PENDING_PAYMENT");
    await succeed(started.id, started.amount);
    await succeed(started.id, started.amount);
    const paid = await orderOf(order.reference);
    expect(paid.status).toBe("CONFIRMED");
    expect(paid.paymentDueAt).toBeNull();
    expect(paid.paidAt).not.toBeNull();
    // Payée : le client ne l'annule plus en ligne (service client)
    const cancel = await call(
      "post",
      `/api/v1/orders/${order.reference}/cancel`,
      client.token,
    ).expect(409);
    expect(codeOf(cancel.body)).toBe("ANNULATION_IMPOSSIBLE");
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
    const latest = matches(
      PaymentSchema,
      (await call("get", `/api/v1/orders/${order.reference}/payments`, client.token).expect(200))
        .body,
    );
    expect(latest).toMatchObject({ id: started.id, status: "succeeded", attemptsLeft: 0 });
    const again = await startPayment(order.reference).expect(409);
    expect(codeOf(again.body)).toBe("PAIEMENT_IMPOSSIBLE");
    // Une référence différente de celle notée : pas cet essai
    await expect(
      payments.applyProviderResult({
        paymentId: started.id,
        providerRef: "AUTRE",
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "PAIEMENT_INTROUVABLE" });
  });

  it("3 essais au plus : échec, autre numéro du même opérateur, expiration ; numéro d'un autre opérateur refusé", async () => {
    const order = await placeOrder();
    const first = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    await payments.applyProviderResult({
      paymentId: first.id,
      providerRef: `SIM-${first.id}`,
      outcome: "failed",
      failureReason: "SOLDE_INSUFFISANT",
    });
    const failed = matches(
      PaymentSchema,
      (await call("get", `/api/v1/orders/${order.reference}/payments`, client.token).expect(200))
        .body,
    );
    expect(failed).toMatchObject({
      status: "failed",
      failureReason: "solde_insuffisant",
      attemptsLeft: 2,
    });

    const moov = await startPayment(order.reference, { phone: "066 00 00 00" }).expect(422);
    expect(codeOf(moov.body)).toBe("NUMERO_PAIEMENT_INVALIDE");
    const otherPhone = newPhone("07");
    const second = matches(
      PaymentSchema,
      (await startPayment(order.reference, { phone: otherPhone }).expect(201)).body,
    );
    expect(second).toMatchObject({ attempt: 2, phone: e164(otherPhone), attemptsLeft: 1 });

    // Sans réponse pendant 3 minutes : expiré, un nouvel essai est permis
    payments.clock = () => new Date(Date.now() + 3 * 60_000 + 1_000);
    const third = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    expect(third).toMatchObject({ attempt: 3, attemptsLeft: 0 });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: second.id } })).status).toBe(
      "EXPIRED",
    );
    payments.clock = () => new Date(Date.now() + 7 * 60_000);
    const fourth = await startPayment(order.reference).expect(409);
    expect(codeOf(fourth.body)).toBe("TROP_D_ESSAIS_PAIEMENT");
  });

  it("opérateur injoignable : 503 PAIEMENT_INDISPONIBLE, essai noté échoué sans compter ; à la livraison : rien à payer en ligne", async () => {
    const order = await placeOrder("moov");
    provider.down = true;
    const res = await startPayment(order.reference).expect(503);
    expect(codeOf(res.body)).toBe("PAIEMENT_INDISPONIBLE");
    const attempts = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(attempts).toMatchObject([{ status: "FAILED", failureReason: "operateur_indisponible" }]);
    provider.down = false;
    const retry = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    expect(retry).toMatchObject({ method: "moov", attempt: 2, attemptsLeft: 2 });

    const cod = await placeOrder("cod");
    expect(codeOf((await startPayment(cod.reference).expect(409)).body)).toBe(
      "PAIEMENT_IMPOSSIBLE",
    );
    // La commande d'un autre compte : introuvable
    const other = await openSession();
    expect(codeOf((await startPayment(order.reference, {}, other.token).expect(404)).body)).toBe(
      "COMMANDE_INTROUVABLE",
    );
  });

  it("paiement reçu après l'annulation : remboursement à faire, puis noté fait par l'administrateur (journal d'audit)", async () => {
    const order = await placeOrder();
    const started = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    await call("post", `/api/v1/orders/${order.reference}/cancel`, client.token).expect(200);
    await succeed(started.id, started.amount);
    expect((await orderOf(order.reference)).status).toBe("CANCELLED");

    // Références neuves : une référence de l'opérateur ne sert qu'une fois dans toute la base
    const [ref0001, ref0002, ref0003] = [1, 2, 3].map(
      () => `AM-${randomBytes(6).toString("hex").toUpperCase()}`,
    );
    const page = matches(
      RefundPageSchema,
      (await call("get", "/api/v1/admin/refunds", admin.token).expect(200)).body,
    );
    const refund = page.items.find((r) => r.orderReference === order.reference);
    expect(refund).toMatchObject({
      amount: order.total,
      method: "airtel",
      phone: started.phone,
      reason: "paiement_non_attendu",
      status: "to_do",
    });
    await call("get", "/api/v1/admin/refunds", client.token).expect(403);

    const done = matches(
      RefundSchema,
      (
        await call("post", `/api/v1/admin/refunds/${refund!.id}/done`, admin.token)
          .send({ externalReference: ref0001 })
          .expect(200)
      ).body,
    );
    expect(done).toMatchObject({ status: "done", externalReference: ref0001 });
    await call("post", `/api/v1/admin/refunds/${refund!.id}/done`, admin.token)
      .send({ externalReference: ref0001 })
      .expect(200);
    const other = await call("post", `/api/v1/admin/refunds/${refund!.id}/done`, admin.token)
      .send({ externalReference: ref0002 })
      .expect(409);
    expect(codeOf(other.body)).toBe("REMBOURSEMENT_DEJA_FAIT");
    expect(
      await prisma.auditEvent.count({ where: { targetId: refund!.id, action: "refund.done" } }),
    ).toBe(1);
    // Une même opération de l'opérateur ne sert pas pour deux remboursements
    const second = await placeOrder();
    const secondPayment = matches(
      PaymentSchema,
      (await startPayment(second.reference).expect(201)).body,
    );
    await call("post", `/api/v1/orders/${second.reference}/cancel`, client.token).expect(200);
    await succeed(secondPayment.id, secondPayment.amount);
    const secondRefund = await prisma.refund.findFirstOrThrow({ where: { orderId: second.id } });
    const reused = await call("post", `/api/v1/admin/refunds/${secondRefund.id}/done`, admin.token)
      .send({ externalReference: ref0001 })
      .expect(409);
    expect(codeOf(reused.body)).toBe("REMBOURSEMENT_DEJA_FAIT");
    await call("post", `/api/v1/admin/refunds/${randomUUID()}/done`, admin.token)
      .send({ externalReference: ref0003 })
      .expect(404);
    const donePage = matches(
      RefundPageSchema,
      (await call("get", "/api/v1/admin/refunds?status=done", admin.token).expect(200)).body,
    );
    expect(donePage.items.map((r) => r.id)).toContain(refund!.id);
  });

  it("annulation par l'administrateur d'une commande payée : stock remis, remboursement à faire, journal ; expédiée : refus", async () => {
    const before = await stockOf(variants[0]!.id);
    const order = await placeOrder();
    const started = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    await succeed(started.id, started.amount);
    expect(await stockOf(variants[0]!.id)).toBe(before - 1);

    const forbidden = await call(
      "post",
      `/api/v1/admin/orders/${order.reference}/cancel`,
      client.token,
    )
      .send({ note: "Demande du client" })
      .expect(403);
    expect(codeOf(forbidden.body)).toBe("ACCES_REFUSE");
    const cancelled = matches(
      OrderSchema,
      (
        await call("post", `/api/v1/admin/orders/${order.reference}/cancel`, admin.token)
          .send({ note: "Demande du client par téléphone" })
          .expect(200)
      ).body,
    );
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "admin" });
    expect(await stockOf(variants[0]!.id)).toBe(before);
    const refunds = await prisma.refund.findMany({ where: { orderId: order.id } });
    expect(refunds).toMatchObject([
      { reason: "ADMIN_CANCEL", status: "TO_DO", amount: order.total },
    ]);
    const trace = await prisma.auditEvent.findFirstOrThrow({
      where: { targetId: order.id, action: "order.cancelled_by_admin" },
    });
    expect(trace).toMatchObject({ actorId: admin.accountId, targetType: "order" });
    // Déjà annulée : inchangée, pas de deuxième remboursement
    await call("post", `/api/v1/admin/orders/${order.reference}/cancel`, admin.token)
      .send({ note: "Deuxième clic" })
      .expect(200);
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(1);

    const shipped = await placeOrder("cod");
    await prisma.order.update({ where: { id: shipped.id }, data: { status: "PREPARING" } });
    await prisma.order.update({ where: { id: shipped.id }, data: { status: "SHIPPED" } });
    const refused = await call(
      "post",
      `/api/v1/admin/orders/${shipped.reference}/cancel`,
      admin.token,
    )
      .send({ note: "Trop tard" })
      .expect(409);
    expect(codeOf(refused.body)).toBe("ANNULATION_IMPOSSIBLE");
    await call("post", `/api/v1/admin/orders/KMD-ZZZZZZ/cancel`, admin.token)
      .send({ note: "Inconnue" })
      .expect(404);
  });

  it("annulation par l'administrateur d'une commande en attente : l'essai en cours expire ; un paiement arrivé ensuite est à rembourser", async () => {
    const order = await placeOrder();
    const started = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    await call("post", `/api/v1/admin/orders/${order.reference}/cancel`, admin.token)
      .send({ note: "Commande en double" })
      .expect(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: started.id } })).status).toBe(
      "EXPIRED",
    );
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
    await succeed(started.id, started.amount);
    expect(await prisma.refund.findMany({ where: { orderId: order.id } })).toMatchObject([
      { reason: "UNEXPECTED_PAYMENT", status: "TO_DO" },
    ]);
  });

  it("paiement à la livraison : encaissement noté par l'administrateur (montant exact, une fois) ; ensuite, plus d'annulation ici", async () => {
    const order = await placeOrder("cod");
    const wrong = await call(
      "post",
      `/api/v1/admin/orders/${order.reference}/cod-collected`,
      admin.token,
    )
      .send({ amount: order.total - 1 })
      .expect(409);
    expect(codeOf(wrong.body)).toBe("ENCAISSEMENT_IMPOSSIBLE");
    const collected = matches(
      PaymentSchema,
      (
        await call("post", `/api/v1/admin/orders/${order.reference}/cod-collected`, admin.token)
          .send({ amount: order.total })
          .expect(201)
      ).body,
    );
    expect(collected).toMatchObject({
      method: "cod",
      status: "succeeded",
      amount: order.total,
      phone: null,
    });
    await call("post", `/api/v1/admin/orders/${order.reference}/cod-collected`, admin.token)
      .send({ amount: order.total })
      .expect(200);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { targetId: order.id, action: "cod.collected" } }),
    ).toBe(1);
    const cancel = await call("post", `/api/v1/admin/orders/${order.reference}/cancel`, admin.token)
      .send({ note: "Trop tard" })
      .expect(409);
    expect(codeOf(cancel.body)).toBe("ANNULATION_IMPOSSIBLE");
    // Encaissée : le client non plus ne peut l'annuler (relecture de sécurité du S5-T04)
    const byClient = await call(
      "post",
      `/api/v1/orders/${order.reference}/cancel`,
      client.token,
    ).expect(409);
    expect(codeOf(byClient.body)).toBe("ANNULATION_IMPOSSIBLE");
    expect((await orderOf(order.reference)).paidAt).not.toBeNull();

    const mobile = await placeOrder();
    const notCod = await call(
      "post",
      `/api/v1/admin/orders/${mobile.reference}/cod-collected`,
      admin.token,
    )
      .send({ amount: mobile.total })
      .expect(409);
    expect(codeOf(notCod.body)).toBe("ENCAISSEMENT_IMPOSSIBLE");
    await call("post", `/api/v1/admin/orders/${order.reference}/cod-collected`, client.token)
      .send({ amount: order.total })
      .expect(403);
  });

  it("réglage du paiement à la livraison (BR-011) : lu par le devis et la commande, changé par l'administrateur (journal)", async () => {
    const initial = matches(
      CodSettingsSchema,
      (await call("get", "/api/v1/admin/settings/cod", admin.token).expect(200)).body,
    );
    expect(initial).toMatchObject({ zones: ["zone_1"], maxTotal: 100_000 });
    await call("get", "/api/v1/admin/settings/cod", client.token).expect(403);

    const off = matches(
      CodSettingsSchema,
      (
        await call("put", "/api/v1/admin/settings/cod", admin.token)
          .send({ zones: [], maxTotal: 100_000 })
          .expect(200)
      ).body,
    );
    expect(off.zones).toEqual([]);
    expect(off.updatedAt).not.toBeNull();
    await call("post", "/api/v1/cart/items", client.token)
      .send({ variantId: variants[0]!.id, quantity: 1 })
      .expect(200);
    const q = matches(
      OrderQuoteSchema,
      (
        await call("post", "/api/v1/orders/quote", client.token)
          .send({ cityId: "libreville" })
          .expect(200)
      ).body,
    );
    expect(q.cod).toEqual({ allowed: false, reason: "Pas disponible pour le moment." });
    const refused = await call("post", "/api/v1/orders", client.token)
      .send({
        idempotencyKey: randomUUID(),
        expectedTotal: q.total,
        delivery: ADDRESS,
        payment: { method: "cod" },
      })
      .expect(422);
    expect(codeOf(refused.body)).toBe("PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE");

    await call("put", "/api/v1/admin/settings/cod", admin.token)
      .send({ zones: ["zone_2", "zone_1", "zone_1"], maxTotal: 1_000 })
      .expect(200)
      .expect((res) =>
        expect(res.body).toMatchObject({ zones: ["zone_1", "zone_2"], maxTotal: 1_000 }),
      );
    const small = matches(
      OrderQuoteSchema,
      (
        await call("post", "/api/v1/orders/quote", client.token)
          .send({ cityId: "libreville" })
          .expect(200)
      ).body,
    );
    expect(small.cod).toEqual({
      allowed: false,
      reason: "Disponible pour les commandes jusqu'à 1 000 FCFA.",
    });
    expect(
      await prisma.auditEvent.count({
        where: { actorId: admin.accountId, action: "settings.cod_updated" },
      }),
    ).toBe(2);
    await call("put", "/api/v1/admin/settings/cod", admin.token)
      .send({ zones: ["zone_9"], maxTotal: 1_000 })
      .expect(400);
    await call("put", "/api/v1/admin/settings/cod", admin.token)
      .send({ zones: ["zone_1"], maxTotal: 20_000_000 })
      .expect(400);
  });

  it("tâche planifiée : les essais sans réponse sont notés expirés", async () => {
    const order = await placeOrder();
    const started = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    await app.get(StalePaymentsScheduler).run(new Date());
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: started.id } })).status).toBe(
      "PENDING",
    );
    expect(
      await app.get(StalePaymentsScheduler).run(new Date(Date.now() + 4 * 60_000)),
    ).toBeGreaterThanOrEqual(1);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: started.id } });
    expect(row).toMatchObject({ status: "EXPIRED", failureReason: "sans_reponse" });
  });

  it("montant reçu différent du montant demandé : commande non confirmée, la somme reçue est à rendre", async () => {
    const order = await placeOrder();
    const started = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    await succeed(started.id, started.amount - 100);
    expect((await orderOf(order.reference)).status).toBe("PENDING_PAYMENT");
    expect(await prisma.refund.findMany({ where: { orderId: order.id } })).toMatchObject([
      { reason: "UNEXPECTED_PAYMENT", amount: started.amount - 100, status: "TO_DO" },
    ]);
  });

  it("paiement confirmé : les autres essais en attente expirent ; 5 demandes par heure au plus vers un même numéro", async () => {
    const order = await placeOrder();
    const first = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    payments.clock = () => new Date(Date.now() + 3 * 60_000 + 1_000);
    const second = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    // Le premier (expiré) réussit en retard : la commande est confirmée, le deuxième n'a plus lieu d'être
    await succeed(first.id, first.amount);
    expect((await orderOf(order.reference)).status).toBe("CONFIRMED");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: second.id } })).status).toBe(
      "EXPIRED",
    );
    payments.clock = () => new Date();

    // Un même numéro visé depuis plusieurs comptes
    const target = newPhone("07");
    let sent = 0;
    for (let i = 0; i < 3; i++) {
      const someone = await openSession();
      const other = await placeOrder("airtel", someone.token);
      for (let j = 0; j < 2 && sent < 5; j++) {
        if (j === 1) payments.clock = () => new Date(Date.now() + 3 * 60_000 + 1_000);
        await startPayment(other.reference, { phone: target }, someone.token).expect(201);
        payments.clock = () => new Date();
        sent++;
      }
      if (sent === 5) {
        payments.clock = () => new Date(Date.now() + 3 * 60_000 + 1_000);
        const blocked = await startPayment(
          other.reference,
          { phone: target },
          someone.token,
        ).expect(409);
        expect(codeOf(blocked.body)).toBe("TROP_D_ESSAIS_PAIEMENT");
      }
    }
    expect(sent).toBe(5);
  });

  it("la base protège paiements et remboursements : champs figés, statuts dans l'ordre, rien ne s'efface", async () => {
    const order = await placeOrder();
    const started = matches(PaymentSchema, (await startPayment(order.reference).expect(201)).body);
    await succeed(started.id, started.amount);
    const id = started.id;
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payments"."payments" SET "amount" = 1 WHERE "id" = '${id}'`,
      ),
    ).rejects.toThrow(/figé/);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payments"."payments" SET "status" = 'FAILED' WHERE "id" = '${id}'`,
      ),
    ).rejects.toThrow(/statut interdit/);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payments"."payments" SET "provider_ref" = 'AUTRE' WHERE "id" = '${id}'`,
      ),
    ).rejects.toThrow(/figée/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "payments"."payments" WHERE "id" = '${id}'`),
    ).rejects.toThrow(/suppression interdite/);
    await expect(
      prisma.$executeRawUnsafe(`TRUNCATE "payments"."payments" CASCADE`),
    ).rejects.toThrow(/suppression interdite/);

    await call("post", `/api/v1/admin/orders/${order.reference}/cancel`, admin.token)
      .send({ note: "Test des règles" })
      .expect(200);
    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payments"."refunds" SET "amount" = 1 WHERE "id" = '${refund.id}'`,
      ),
    ).rejects.toThrow(/figé/);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payments"."refunds" SET "status" = 'DONE' WHERE "id" = '${refund.id}'`,
      ),
    ).rejects.toThrow(/refunds_done_check/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "payments"."refunds" WHERE "id" = '${refund.id}'`),
    ).rejects.toThrow(/suppression interdite/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "orders"."cod_settings"`)).rejects.toThrow(
      /suppression interdite/,
    );
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "orders"."cod_settings" SET "zones" = ARRAY['zone_9']::VARCHAR(10)[]`,
      ),
    ).rejects.toThrow(/cod_settings_zones_check/);
  });
});
