import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import { ZONE_IDS, ZONES } from "@kemdia/contracts/delivery";
import {
  DeliveryTariffsSchema,
  KEMDIA_SHOP_ID,
  OrderQuoteSchema,
  OrderSchema,
  PaymentSchema,
  ProblemDetailsSchema,
  ReadyOrderListSchema,
  ShipmentListSchema,
  ShipmentSchema,
  ShopSchema,
  VendorProductSchema,
  type DeliveryTariffsRequest,
  type Order,
  type Shipment,
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
import { PaymentService } from "../src/modules/payments/index.js";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from "../src/modules/payments/application/ports.js";
import { testDatabaseUrl } from "./integration-db.js";
import { confirmSecondFactor } from "./second-factor-helper.js";

/**
 * Livraisons sur une VRAIE base (S7-T01, ADR-0040 ; BR-021), par HTTP : barème réglé par un administrateur et appliqué
 * au devis et à la commande ; remise au transporteur (commande expédiée, parts des frais) ; échec, nouvelle tentative,
 * livraison ; échec puis annulation (stock rendu, remboursement « à faire ») ; refus (vendeur en attente, droits) ;
 * règles de la base. Commandes et expéditions ne s'effacent jamais : comptes neufs à chaque test.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;

const ADDRESS = {
  fullName: "Marie Nze",
  phone: "077 12 34 56",
  cityId: "libreville",
  neighborhood: "Glass",
  landmark: "Portail bleu face à la pharmacie",
};

const DEFAULT_TARIFFS: DeliveryTariffsRequest = {
  zones: ZONE_IDS.map((id) => {
    const { baseFee, freeThreshold, daysMin, daysMax } = ZONES[id];
    return { id, baseFee, freeThreshold, daysMin, daysMax };
  }),
};
/** Libreville (zone 1, sans supplément) : 1 750 FCFA de frais, jamais offerte, 2 à 3 jours. */
const PAID_TARIFFS: DeliveryTariffsRequest = {
  zones: DEFAULT_TARIFFS.zones.map((z) =>
    z.id === "zone_1"
      ? { ...z, baseFee: 1_750, freeThreshold: 10_000_000, daysMin: 2, daysMax: 3 }
      : z,
  ),
};

class FakeProvider implements PaymentProvider {
  readonly name = "simule";
  readonly available = true;
  request(payment: { paymentId: string }) {
    return Promise.resolve({ providerRef: `SIM-${payment.paymentId}` });
  }
}

type Session = { token: string; accountId: string };

describe("Livraisons (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Session;
  let client: Session;
  let kemdiaVariant = "";
  let categoryId = "";

  const call = (method: "get" | "post" | "put", url: string, token?: string) => {
    const server = request(app.getHttpServer());
    const req = server[method](url).set("X-Kemdia-Internal-Key", INTERNAL_KEY);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  async function openSession(role?: "ADMIN" | "MODERATOR"): Promise<Session> {
    const email = `livraison.${randomUUID()}@exemple.ga`;
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
    if (role) await confirmSecondFactor(prisma, account.id);
    return { token: opened.token, accountId: account.id };
  }

  async function placeOrder(variantId: string, method: "cod" | "airtel" = "cod"): Promise<Order> {
    await call("post", "/api/v1/cart/items", client.token)
      .send({ variantId, quantity: 1 })
      .expect(200);
    const { total } = matches(
      OrderQuoteSchema,
      (
        await call("post", "/api/v1/orders/quote", client.token)
          .send({ cityId: "libreville" })
          .expect(200)
      ).body,
    );
    return matches(
      OrderSchema,
      (
        await call("post", "/api/v1/orders", client.token)
          .send({
            idempotencyKey: randomUUID(),
            expectedTotal: total,
            delivery: ADDRESS,
            payment: method === "cod" ? { method } : { method, phone: "077 98 76 54" },
          })
          .expect(201)
      ).body,
    );
  }

  const act = (reference: string, step: string, body: object = {}, token = admin.token) =>
    call("post", `/api/v1/admin/shipping/shipments/${reference}/${step}`, token).send(body);
  const shipment = (body: unknown): Shipment => matches(ShipmentSchema, body);
  const orderRow = (reference: string) => prisma.order.findUniqueOrThrow({ where: { reference } });
  const stockOf = async (id: string) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;
  const setTariffs = (tariffs: DeliveryTariffsRequest) =>
    call("put", "/api/v1/admin/shipping/tariffs", admin.token).send(tariffs);

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: testDatabaseUrl(),
      API_INTERNAL_KEY: INTERNAL_KEY,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(new FakeProvider())
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "catalog"."product_variants", "catalog"."products", "catalog"."categories" CASCADE',
    );
    await importCatalog(prepareDemoCatalog(demoCatalog), {
      categories: new PrismaCategoryRepository(prisma),
      products: new PrismaProductRepository(prisma),
    });
    categoryId = (await prisma.category.findFirstOrThrow({ orderBy: { slug: "asc" } })).id;
  });

  beforeEach(async () => {
    admin = await openSession("ADMIN");
    client = await openSession();
    const cheapest = await prisma.productVariant.findFirstOrThrow({
      where: { product: { shopId: KEMDIA_SHOP_ID } },
      orderBy: [{ price: "asc" }, { sku: "asc" }],
    });
    await prisma.productVariant.update({
      where: { id: cheapest.id },
      data: { stock: 50, isActive: true },
    });
    kemdiaVariant = cheapest.id;
    await setTariffs(PAID_TARIFFS).expect(200);
  });

  afterAll(async () => {
    // Barème de départ rendu aux autres fichiers de tests
    if (admin) await setTariffs(DEFAULT_TARIFFS);
    await app?.close();
  });

  it("barème : public, réglé par un administrateur (journal d'audit), appliqué au devis et à la commande", async () => {
    const pub = matches(
      DeliveryTariffsSchema,
      (await call("get", "/api/v1/shipping/tariffs").expect(200)).body,
    );
    expect(pub.zones[0]).toMatchObject({
      id: "zone_1",
      label: ZONES.zone_1.label,
      baseFee: 1_750,
      daysMin: 2,
      daysMax: 3,
    });
    expect(pub.updatedAt).not.toBeNull();
    const audit = await prisma.auditEvent.findFirst({
      where: { action: "settings.delivery_updated", actorId: admin.accountId },
    });
    expect(audit?.details).toMatchObject({ zone1: "1750/10000000/2-3" });

    const order = await placeOrder(kemdiaVariant);
    expect(order).toMatchObject({ deliveryFee: 1_750 });
    expect(order.total).toBe(order.subtotal + 1_750);

    // Barème invalide : zone en double, délais à l'envers
    const twice = await setTariffs({
      zones: [...PAID_TARIFFS.zones.slice(0, 3), PAID_TARIFFS.zones[0]!],
    }).expect(422);
    expect(codeOf(twice.body)).toBe("TARIFS_INVALIDES");
    await setTariffs({
      zones: PAID_TARIFFS.zones.map((z) => ({ ...z, daysMin: 5, daysMax: 1 })),
    }).expect(422);
    // Client ordinaire : refusé
    await call("put", "/api/v1/admin/shipping/tariffs", client.token)
      .send(PAID_TARIFFS)
      .expect(403);
  });

  it("remise au transporteur : commande expédiée, part de Kemdia 15 % (entier inférieur), puis échec, nouvelle tentative, livrée", async () => {
    const order = await placeOrder(kemdiaVariant);
    const ready = matches(
      ReadyOrderListSchema,
      (await call("get", "/api/v1/admin/shipping/ready", admin.token).expect(200)).body,
    );
    const line = ready.items.find((o) => o.reference === order.reference);
    expect(line).toMatchObject({ paymentMethod: "cod", paid: false, deliveryFee: 1_750 });
    // Ni le nom ni le téléphone du client dans la liste
    expect(JSON.stringify(line)).not.toContain("Marie");

    const handed = shipment((await act(order.reference, "hand-over").expect(200)).body);
    expect(handed).toMatchObject({
      status: "in_transit",
      carrier: "manuel",
      attempt: 1,
      cityName: "Libreville",
      deliveryFee: 1_750,
      kemdiaShare: 262,
      carrierShare: 1_488,
    });
    expect((await orderRow(order.reference)).status).toBe("SHIPPED");
    // Double clic : rien ne change ; plus dans la liste des commandes prêtes ; le client ne peut plus annuler
    expect(
      shipment((await act(order.reference, "hand-over").expect(200)).body).events,
    ).toHaveLength(1);
    const after = matches(
      ReadyOrderListSchema,
      (await call("get", "/api/v1/admin/shipping/ready", admin.token).expect(200)).body,
    );
    expect(after.items.map((o) => o.reference)).not.toContain(order.reference);
    await call("post", `/api/v1/orders/${order.reference}/cancel`, client.token)
      .send({})
      .expect(409);

    // Livrée sans être en route ? Non : d'abord l'échec
    const failed = shipment(
      (
        await act(order.reference, "failed", {
          reason: "  Client absent,\u0000 téléphone éteint ",
        }).expect(200)
      ).body,
    );
    expect(failed).toMatchObject({
      status: "failed",
      failureReason: "Client absent, téléphone éteint",
    });
    expect(codeOf((await act(order.reference, "delivered").expect(409)).body)).toBe(
      "STATUT_EXPEDITION_INCOMPATIBLE",
    );
    const retried = shipment((await act(order.reference, "retry").expect(200)).body);
    expect(retried).toMatchObject({ status: "in_transit", attempt: 2, failureReason: null });
    const delivered = shipment((await act(order.reference, "delivered").expect(200)).body);
    expect(delivered.status).toBe("delivered");
    expect(delivered.events.map((e) => e.status)).toEqual([
      "in_transit",
      "failed",
      "in_transit",
      "delivered",
    ]);
    expect((await orderRow(order.reference)).status).toBe("DELIVERED");
    // Livrée : plus rien ne bouge
    await act(order.reference, "failed", { reason: "Erreur de saisie" }).expect(409);

    const listed = matches(
      ShipmentListSchema,
      (
        await call("get", "/api/v1/admin/shipping/shipments?status=delivered", admin.token).expect(
          200,
        )
      ).body,
    );
    expect(listed.items.map((s) => s.reference)).toContain(order.reference);
    const actions = (
      await prisma.auditEvent.findMany({
        where: {
          targetId: (await orderRow(order.reference)).id,
          action: { startsWith: "shipment." },
        },
        orderBy: { occurredAt: "asc" },
      })
    ).map((e) => e.action);
    expect(actions).toEqual([
      "shipment.handed_over",
      "shipment.failed",
      "shipment.retried",
      "shipment.delivered",
    ]);
  });

  it("échec puis annulation : commande annulée, stock rendu ; Mobile Money payé → remboursement « à faire »", async () => {
    const order = await placeOrder(kemdiaVariant, "airtel");
    const payment = matches(
      PaymentSchema,
      (
        await call("post", `/api/v1/orders/${order.reference}/payments`, client.token)
          .send({})
          .expect(201)
      ).body,
    );
    await app.get(PaymentService).applyProviderResult({
      paymentId: payment.id,
      providerRef: `SIM-${payment.id}`,
      outcome: "succeeded",
      amount: order.total,
    });
    const stockBefore = await stockOf(kemdiaVariant);
    await act(order.reference, "hand-over").expect(200);
    // Annuler sans échec noté : refusé
    expect(
      codeOf(
        (await act(order.reference, "cancel", { note: "Client injoignable" }).expect(409)).body,
      ),
    ).toBe("STATUT_EXPEDITION_INCOMPATIBLE");
    await act(order.reference, "failed", { reason: "Adresse introuvable" }).expect(200);
    await act(order.reference, "cancel", { note: "x" }).expect(400);
    const cancelled = shipment(
      (await act(order.reference, "cancel", { note: "Client injoignable trois jours" }).expect(200))
        .body,
    );
    expect(cancelled).toMatchObject({ status: "cancelled", failureReason: "Adresse introuvable" });
    expect(await orderRow(order.reference)).toMatchObject({
      status: "CANCELLED",
      cancelReason: "DELIVERY_FAILED",
    });
    expect(await stockOf(kemdiaVariant)).toBe(stockBefore + 1);
    const refunds = await prisma.refund.findMany({ where: { orderReference: order.reference } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      reason: "DELIVERY_CANCEL",
      status: "TO_DO",
      amount: order.total,
    });
    // Une seconde fois : rien ne change
    await act(order.reference, "cancel", { note: "Client injoignable trois jours" }).expect(200);
    expect(await prisma.refund.count({ where: { orderReference: order.reference } })).toBe(1);
  });

  it("refus : vendeur qui n'a pas répondu, commande inconnue, pas d'expédition, compte non administrateur", async () => {
    const moderator = await openSession("MODERATOR");
    const vendor = await openSession();
    const shop = matches(
      ShopSchema,
      (
        await call("post", "/api/v1/vendors/shop", vendor.token)
          .send({
            name: `Atelier ${randomBytes(4).toString("hex")}`,
            city: "Libreville",
            phone: "066 12 34 56",
            description: "Pagnes, robes et chemises cousus sur commande.",
          })
          .expect(201)
      ).body,
    );
    await call("post", `/api/v1/admin/shops/${shop.id}/approve`, admin.token).send({}).expect(200);
    const product = matches(
      VendorProductSchema,
      (
        await call("post", "/api/v1/vendors/products", vendor.token)
          .send({
            title: `Pagne wax ${randomBytes(3).toString("hex")}`,
            description: "Pagne wax 100 % coton, 6 yards, motifs variés, cousu à Libreville.",
            brand: "Atelier Awa",
            categoryId,
            variants: [{ name: "Rouge", price: 9_000, stock: 5 }],
          })
          .expect(201)
      ).body,
    );
    const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    await call("post", `/api/v1/moderation/products/${product.id}/approve`, moderator.token)
      .send({ submittedAt: row.submittedAt!.toISOString() })
      .expect(200);
    const order = await placeOrder(product.variants[0]!.id);
    // Le vendeur n'a pas encore accepté : pas prête, remise refusée
    const ready = matches(
      ReadyOrderListSchema,
      (await call("get", "/api/v1/admin/shipping/ready", admin.token).expect(200)).body,
    );
    expect(ready.items.map((o) => o.reference)).not.toContain(order.reference);
    expect(codeOf((await act(order.reference, "hand-over").expect(409)).body)).toBe(
      "EXPEDITION_IMPOSSIBLE",
    );
    expect((await orderRow(order.reference)).status).toBe("CONFIRMED");

    expect(codeOf((await act("KMD-ZZZZZZ", "hand-over").expect(404)).body)).toBe(
      "COMMANDE_INTROUVABLE",
    );
    expect(codeOf((await act(order.reference, "delivered").expect(404)).body)).toBe(
      "EXPEDITION_INTROUVABLE",
    );
    await act(order.reference, "hand-over", {}, moderator.token).expect(403);
    await act(order.reference, "hand-over", {}, client.token).expect(403);
    await call("get", "/api/v1/admin/shipping/ready").expect(401);
    await call("get", "/api/v1/admin/shipping/shipments?status=perdu", admin.token).expect(400);
  });

  it("règles de la base : parts et champs figés, passages interdits, historique en ajout seul", async () => {
    const order = await placeOrder(kemdiaVariant);
    const { reference } = shipment((await act(order.reference, "hand-over").expect(200)).body);
    const id = (await prisma.shipment.findUniqueOrThrow({ where: { orderReference: reference } }))
      .id;
    const sql = (statement: string) => prisma.$executeRawUnsafe(statement, id);
    await expect(
      sql(
        `UPDATE "shipping"."shipments" SET "kemdia_share" = 1000, "carrier_share" = 750 WHERE "id" = $1::uuid`,
      ),
    ).rejects.toThrow();
    await expect(
      sql(`UPDATE "shipping"."shipments" SET "status" = 'CANCELLED' WHERE "id" = $1::uuid`),
    ).rejects.toThrow();
    await expect(
      sql(`UPDATE "shipping"."shipments" SET "attempt" = 0 WHERE "id" = $1::uuid`),
    ).rejects.toThrow();
    await expect(sql(`DELETE FROM "shipping"."shipments" WHERE "id" = $1::uuid`)).rejects.toThrow();
    await expect(
      sql(`DELETE FROM "shipping"."shipment_events" WHERE "shipment_id" = $1::uuid`),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "shipping"."delivery_tariffs" SET "days_min" = 9, "days_max" = 1 WHERE "zone_id" = 'zone_2'`,
      ),
    ).rejects.toThrow();
  });
});
