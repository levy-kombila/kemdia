import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  OrderPageSchema,
  OrderQuoteSchema,
  OrderSchema,
  ProblemDetailsSchema,
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
import { MOBILE_MONEY } from "../src/modules/orders/application/ports.js";
import { OverdueOrdersScheduler } from "../src/modules/orders/infrastructure/overdue-orders.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Commandes sur une VRAIE base (S5-T02, ADR-0024), de bout en bout par HTTP : panier → commande, stock réservé dans la
 * même transaction (BR-012), montants du serveur (BR-004), idempotence, annulation, paiement non reçu, règles SQL.
 * Les commandes ne s'effacent jamais (la base l'interdit) : chaque test utilise des comptes neufs.
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

describe("Commandes (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token = "";
  let accountId = "";
  let variants: { id: string; price: number; productId: string }[] = [];

  const call = (method: "get" | "post", url: string, as = token) => {
    const server = request(app.getHttpServer());
    const req = method === "get" ? server.get(url) : server.post(url);
    return req.set("X-Kemdia-Internal-Key", INTERNAL_KEY).set("Authorization", `Bearer ${as}`);
  };
  const stockOf = async (id: string) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;
  const addToCart = (variantId: string, quantity: number, as = token) =>
    call("post", "/api/v1/cart/items")
      .set("Authorization", `Bearer ${as}`)
      .send({ variantId, quantity })
      .expect(200);
  const quote = async (cityId = "libreville", as = token) =>
    matches(
      OrderQuoteSchema,
      (await call("post", "/api/v1/orders/quote", as).send({ cityId }).expect(200)).body,
    );
  /** Commande du panier au total du devis (le devis est lu AVANT de préparer la requête). */
  const placeOrder = async (): Promise<Order> => {
    const { total } = await quote();
    return (await call("post", "/api/v1/orders").send(orderBody(total)).expect(201)).body as Order;
  };
  const orderBody = (expectedTotal: number, overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: randomUUID(),
    expectedTotal,
    delivery: ADDRESS,
    payment: { method: "airtel", phone: "077 12 34 56" },
    ...overrides,
  });

  async function openSession(): Promise<{ token: string; accountId: string }> {
    const email = `commande.${randomUUID()}@exemple.ga`;
    const now = new Date();
    const account = Account.register({
      id: randomUUID(),
      firstName: "Marie",
      lastName: "Nze",
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
    await app.init();
    prisma = app.get(PrismaService);
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
      `UPDATE "catalog"."product_variants" SET "stock" = 50, "is_active" = true`,
    );
    await prisma.$executeRawUnsafe(`UPDATE "catalog"."products" SET "status" = 'PUBLISHED'`);
    // Les moins chères d'abord : la première reste sous le plafond du paiement à la livraison (100 000 FCFA)
    variants = (
      await prisma.productVariant.findMany({
        select: { id: true, price: true, productId: true },
        orderBy: [{ price: "asc" }, { sku: "asc" }],
      })
    ).map((v) => ({ id: v.id, price: v.price, productId: v.productId }));
    ({ token, accountId } = await openSession());
  });

  afterAll(async () => {
    await app.close();
  });

  it("devis : total du serveur, frais de la ville, paiement à la livraison possible ou non", async () => {
    const [a] = variants;
    await addToCart(a!.id, 1);
    const libreville = await quote("libreville");
    expect(libreville).toMatchObject({
      subtotal: a!.price,
      cartOk: true,
      cod: { allowed: true },
      // Poste de développement : l'opérateur simulé est actif (S5-T07)
      mobileMoney: { allowed: true },
    });
    expect(libreville.total).toBe(libreville.subtotal + libreville.deliveryFee);
    const portGentil = await quote("port-gentil");
    expect(portGentil.cod.allowed).toBe(false);
    expect(portGentil.deliveryDaysMin).toBeGreaterThanOrEqual(2);
    const res = await call("post", "/api/v1/orders/quote").send({ cityId: "paris" }).expect(422);
    expect(codeOf(res.body)).toBe("ADRESSE_INVALIDE");
  });

  it("commande Mobile Money : 201, stock réservé, panier vidé, 30 min pour payer, montants du catalogue", async () => {
    const [a, b] = variants;
    await addToCart(a!.id, 2);
    await addToCart(b!.id, 1);
    const { total } = await quote();
    const before = Date.now();
    const res = await call("post", "/api/v1/orders").send(orderBody(total)).expect(201);
    const order = matches(OrderSchema, res.body);
    expect(order).toMatchObject({
      status: "pending_payment",
      paymentMethod: "airtel",
      paymentPhone: "+241077123456",
      subtotal: 2 * a!.price + b!.price,
      total,
      canCancel: true,
      cancelReason: null,
    });
    expect(order.reference).toMatch(/^KMD-[A-Z2-9]{6}$/);
    expect(order.lines.map((l) => [l.variantId, l.quantity, l.unitPrice, l.lineTotal])).toEqual([
      [a!.id, 2, a!.price, 2 * a!.price],
      [b!.id, 1, b!.price, b!.price],
    ]);
    expect(order.delivery).toMatchObject({
      fullName: "Marie Nze",
      phone: "+241077123456",
      cityName: "Libreville",
    });
    const due = new Date(order.paymentDueAt!).getTime();
    expect(due - before).toBeGreaterThanOrEqual(29 * 60_000);
    expect(due - before).toBeLessThanOrEqual(31 * 60_000);
    expect(order.history.map((h) => h.status)).toEqual(["pending_payment"]);
    expect(await stockOf(a!.id)).toBe(48);
    expect(await stockOf(b!.id)).toBe(49);
    expect(await prisma.cartItem.count({ where: { cart: { accountId } } })).toBe(0);
  });

  it("paiement à la livraison : confirmée tout de suite ; hors Grand Libreville : refusée", async () => {
    const [a] = variants;
    await addToCart(a!.id, 1);
    const far = await quote("port-gentil");
    const refused = await call("post", "/api/v1/orders")
      .send(
        orderBody(far.total, {
          delivery: { ...ADDRESS, cityId: "port-gentil", neighborhood: "Centre" },
          payment: { method: "cod" },
        }),
      )
      .expect(422);
    expect(codeOf(refused.body)).toBe("PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE");
    expect(await stockOf(a!.id)).toBe(50);
    const { total } = await quote();
    const order = matches(
      OrderSchema,
      (
        await call("post", "/api/v1/orders")
          .send(orderBody(total, { payment: { method: "cod" } }))
          .expect(201)
      ).body,
    );
    expect(order).toMatchObject({
      status: "confirmed",
      paymentMethod: "cod",
      paymentPhone: null,
      paymentDueAt: null,
    });
  });

  it("idempotence : la même clé renvoie la même commande (200), même envoyée deux fois en même temps", async () => {
    const [a] = variants;
    await addToCart(a!.id, 3);
    const body = orderBody((await quote()).total);
    const [first, second] = await Promise.all([
      call("post", "/api/v1/orders").send(body),
      call("post", "/api/v1/orders").send(body),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    const reference = matches(OrderSchema, first.body).reference;
    expect(matches(OrderSchema, second.body).reference).toBe(reference);
    const third = await call("post", "/api/v1/orders").send(body).expect(200);
    expect(matches(OrderSchema, third.body).reference).toBe(reference);
    expect(await prisma.order.count({ where: { accountId } })).toBe(1);
    // La même clé avec une autre adresse : refus, jamais la commande d'avant présentée comme celle-ci
    const other = await call("post", "/api/v1/orders")
      .send({ ...body, delivery: { ...ADDRESS, landmark: "Une tout autre adresse" } })
      .expect(409);
    expect(codeOf(other.body)).toBe("CLE_DEJA_UTILISEE");
    expect(await stockOf(a!.id)).toBe(47);
  });

  it("PRIX_MODIFIE : total attendu différent → refus, rien n'est réservé ni retiré du panier", async () => {
    const [a] = variants;
    await addToCart(a!.id, 2);
    const { total } = await quote();
    await prisma.productVariant.update({ where: { id: a!.id }, data: { price: a!.price + 500 } });
    const res = await call("post", "/api/v1/orders").send(orderBody(total)).expect(409);
    expect(codeOf(res.body)).toBe("PRIX_MODIFIE");
    expect(await stockOf(a!.id)).toBe(50);
    expect(await prisma.cartItem.count({ where: { cart: { accountId } } })).toBe(1);
    // Nouveau total relu : la commande passe, au nouveau prix
    const fresh = await quote();
    const order = matches(
      OrderSchema,
      (await call("post", "/api/v1/orders").send(orderBody(fresh.total)).expect(201)).body,
    );
    expect(order.lines[0]!.unitPrice).toBe(a!.price + 500);
  });

  it("PANIER_A_VERIFIER : une ligne sans stock suffisant annule TOUTE la réservation", async () => {
    const [a, b] = variants;
    await addToCart(a!.id, 2);
    await addToCart(b!.id, 5);
    const { total } = await quote();
    await prisma.productVariant.update({ where: { id: b!.id }, data: { stock: 4 } });
    const res = await call("post", "/api/v1/orders").send(orderBody(total)).expect(409);
    expect(codeOf(res.body)).toBe("PANIER_A_VERIFIER");
    expect(await stockOf(a!.id)).toBe(50);
    expect(await stockOf(b!.id)).toBe(4);
    expect(await prisma.order.count({ where: { accountId } })).toBe(0);
  });

  it("BR-012 : pas de survente — deux clients se disputent le dernier article, un seul l'obtient", async () => {
    const [a] = variants;
    const other = await openSession();
    await addToCart(a!.id, 1);
    await addToCart(a!.id, 1, other.token);
    const totals = [(await quote()).total, (await quote("libreville", other.token)).total];
    await prisma.productVariant.update({ where: { id: a!.id }, data: { stock: 1 } });
    const results = await Promise.all([
      call("post", "/api/v1/orders").send(orderBody(totals[0]!)),
      call("post", "/api/v1/orders", other.token).send(orderBody(totals[1]!)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(codeOf(results.find((r) => r.status === 409)!.body)).toBe("PANIER_A_VERIFIER");
    expect(await stockOf(a!.id)).toBe(0);
  });

  it("refuse panier vide, adresse ou numéro invalides, et tout article ou prix envoyé par le site", async () => {
    expect(codeOf((await call("post", "/api/v1/orders").send(orderBody(0)).expect(409)).body)).toBe(
      "PANIER_VIDE",
    );
    const [a] = variants;
    await addToCart(a!.id, 1);
    const { total } = await quote();
    const badAddress = await call("post", "/api/v1/orders")
      .send(orderBody(total, { delivery: { ...ADDRESS, neighborhood: "Inventé" } }))
      .expect(422);
    expect(codeOf(badAddress.body)).toBe("ADRESSE_INVALIDE");
    const badPhone = await call("post", "/api/v1/orders")
      .send(orderBody(total, { payment: { method: "moov", phone: "077123456" } }))
      .expect(422);
    expect(codeOf(badPhone.body)).toBe("NUMERO_PAIEMENT_INVALIDE");
    await call("post", "/api/v1/orders")
      .send({ ...orderBody(total), items: [{ variantId: a!.id, quantity: 1, price: 1 }] })
      .expect(400);
    await call("post", "/api/v1/orders")
      .send({ ...orderBody(total), total: 1 })
      .expect(400);
    expect(await stockOf(a!.id)).toBe(50);
  });

  it("lecture : ses commandes seulement, de la plus récente à la plus ancienne, page par page", async () => {
    const references: string[] = [];
    for (const v of variants.slice(0, 3)) {
      await addToCart(v.id, 1);
      const order = await placeOrder();
      references.push(order.reference);
    }
    const first = matches(
      OrderPageSchema,
      (await call("get", "/api/v1/orders?limit=2").expect(200)).body,
    );
    expect(first.items.map((o) => o.reference)).toEqual([references[2], references[1]]);
    expect(first.nextCursor).not.toBeNull();
    const second = matches(
      OrderPageSchema,
      (await call("get", `/api/v1/orders?limit=2&before=${first.nextCursor}`).expect(200)).body,
    );
    expect(second.items.map((o) => o.reference)).toEqual([references[0]]);
    expect(second.nextCursor).toBeNull();
    const one = matches(
      OrderSchema,
      (await call("get", `/api/v1/orders/${references[0]}`).expect(200)).body,
    );
    expect(one.reference).toBe(references[0]);

    const other = await openSession();
    const res = await call("get", `/api/v1/orders/${references[0]}`, other.token).expect(404);
    expect(codeOf(res.body)).toBe("COMMANDE_INTROUVABLE");
    await call("post", `/api/v1/orders/${references[0]}/cancel`, other.token).expect(404);
    expect(
      matches(OrderPageSchema, (await call("get", "/api/v1/orders", other.token).expect(200)).body)
        .items,
    ).toEqual([]);
    await call("get", "/api/v1/orders/KMD-0000").expect(400);
  });

  it("annulation par le client : stock remis, historique ; déjà annulée → inchangée ; expédiée → refus", async () => {
    const [a, b] = variants;
    await addToCart(a!.id, 2);
    const order = await placeOrder();
    expect(await stockOf(a!.id)).toBe(48);
    const cancelled = matches(
      OrderSchema,
      (await call("post", `/api/v1/orders/${order.reference}/cancel`).expect(200)).body,
    );
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelReason: "client",
      canCancel: false,
      paymentDueAt: null,
    });
    expect(cancelled.history.map((h) => h.status)).toEqual(["pending_payment", "cancelled"]);
    expect(await stockOf(a!.id)).toBe(50);
    await call("post", `/api/v1/orders/${order.reference}/cancel`).expect(200);
    expect(await stockOf(a!.id)).toBe(50);

    await addToCart(b!.id, 1);
    const shipped = await placeOrder();
    // Paiement reçu puis colis préparé et expédié (changements faits plus tard par le paiement et le back-office)
    await prisma.order.update({
      where: { id: shipped.id },
      data: { status: "CONFIRMED", paymentDueAt: null },
    });
    const paid = await call("post", `/api/v1/orders/${shipped.reference}/cancel`).expect(409);
    expect(codeOf(paid.body)).toBe("ANNULATION_IMPOSSIBLE");
    expect(
      matches(
        OrderSchema,
        (await call("get", `/api/v1/orders/${shipped.reference}`).expect(200)).body,
      ).canCancel,
    ).toBe(false);
    await prisma.order.update({ where: { id: shipped.id }, data: { status: "PREPARING" } });
    await prisma.order.update({ where: { id: shipped.id }, data: { status: "SHIPPED" } });
    const refused = await call("post", `/api/v1/orders/${shipped.reference}/cancel`).expect(409);
    expect(codeOf(refused.body)).toBe("ANNULATION_IMPOSSIBLE");
    expect(await stockOf(b!.id)).toBe(49);
  });

  it("paiement non reçu à temps : annulée automatiquement, stock remis en vente", async () => {
    // Base partagée : d'abord, les commandes échues laissées par d'autres tests (leur stock ne doit pas fausser les comptes)
    await app.get(OverdueOrdersScheduler).run(new Date());
    await prisma.$executeRawUnsafe(`UPDATE "catalog"."product_variants" SET "stock" = 50`);
    const [a, b] = variants;
    await addToCart(a!.id, 2);
    const late = await placeOrder();
    await addToCart(b!.id, 1);
    const onTime = await placeOrder();
    await prisma.order.update({
      where: { id: late.id },
      data: { paymentDueAt: new Date(Date.now() - 60_000) },
    });
    expect(await app.get(OverdueOrdersScheduler).run(new Date())).toBeGreaterThanOrEqual(1);
    const expired = matches(
      OrderSchema,
      (await call("get", `/api/v1/orders/${late.reference}`).expect(200)).body,
    );
    expect(expired).toMatchObject({ status: "cancelled", cancelReason: "paiement_expire" });
    expect(await stockOf(a!.id)).toBe(50);
    expect(
      matches(
        OrderSchema,
        (await call("get", `/api/v1/orders/${onTime.reference}`).expect(200)).body,
      ).status,
    ).toBe("pending_payment");
    expect(await stockOf(b!.id)).toBe(49);
  });

  it("la base protège les commandes : montants figés, aucune suppression, lignes et historique en ajout seul", async () => {
    const [a] = variants;
    await addToCart(a!.id, 1);
    const order = await placeOrder();
    await expect(
      prisma.order.update({ where: { id: order.id }, data: { total: 1, subtotal: 1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.order.update({ where: { id: order.id }, data: { deliveryLandmark: "ailleurs" } }),
    ).rejects.toThrow();
    await expect(prisma.order.delete({ where: { id: order.id } })).rejects.toThrow();
    await expect(
      prisma.orderItem.updateMany({ where: { orderId: order.id }, data: { quantity: 20 } }),
    ).rejects.toThrow();
    await expect(
      prisma.orderStatusChange.deleteMany({ where: { orderId: order.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe('TRUNCATE "orders"."order_items" CASCADE'),
    ).rejects.toThrow();
    // L'échéance de paiement ne recule jamais
    await expect(
      prisma.order.update({
        where: { id: order.id },
        data: { paymentDueAt: new Date(Date.now() + 86_400_000) },
      }),
    ).rejects.toThrow();
    // Statuts : seulement dans l'ordre prévu
    await expect(
      prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } }),
    ).rejects.toThrow();
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED", paymentDueAt: null },
    });
    await call("post", `/api/v1/orders/${order.reference}/cancel`).expect(409);
    // Annulée : plus aucun changement possible (pas de commande « ressuscitée » dont le stock a été rendu)
    await addToCart(a!.id, 1);
    const second = await placeOrder();
    await call("post", `/api/v1/orders/${second.reference}/cancel`).expect(200);
    await expect(
      prisma.order.update({
        where: { id: second.id },
        data: { status: "CONFIRMED", cancelledAt: null, cancelReason: null },
      }),
    ).rejects.toThrow();
  });

  it("3 commandes ouvertes au plus par compte : la 4e est refusée tant qu'aucune n'est payée ou annulée", async () => {
    const opened: Order[] = [];
    for (const v of variants.slice(0, 3)) {
      await addToCart(v.id, 1);
      opened.push(await placeOrder());
    }
    await addToCart(variants[3]!.id, 1);
    const { total } = await quote();
    const refused = await call("post", "/api/v1/orders").send(orderBody(total)).expect(409);
    expect(codeOf(refused.body)).toBe("TROP_DE_COMMANDES_OUVERTES");
    expect(await stockOf(variants[3]!.id)).toBe(50);
    await call("post", `/api/v1/orders/${opened[0]!.reference}/cancel`).expect(200);
    await call("post", "/api/v1/orders").send(orderBody(total)).expect(201);
  });

  it("sans fournisseur Mobile Money : le devis le dit, la commande Mobile Money est refusée (422), pas celle à la livraison", async () => {
    // Même objet que celui lu par OrderService : on simule un environnement sans fournisseur (préproduction, production)
    const mobileMoney = app.get<{ available: boolean }>(MOBILE_MONEY);
    mobileMoney.available = false;
    try {
      const [a] = variants;
      await addToCart(a!.id, 1);
      const { total, mobileMoney: offered } = await quote();
      expect(offered).toEqual({ allowed: false });
      const refused = await call("post", "/api/v1/orders").send(orderBody(total)).expect(422);
      expect(codeOf(refused.body)).toBe("MOBILE_MONEY_INDISPONIBLE");
      // Rien n'est réservé, le panier reste tel quel
      expect(await stockOf(a!.id)).toBe(50);
      expect((await quote()).cartOk).toBe(true);
      const cod = await call("post", "/api/v1/orders")
        .send(orderBody(total, { payment: { method: "cod" } }))
        .expect(201);
      expect((cod.body as Order).status).toBe("confirmed");
    } finally {
      mobileMoney.available = true;
    }
  });

  it("panier tenu par une autre demande : 409 PANIER_OCCUPE au bout de 3 s au plus, rien n'est gardé", async () => {
    const [a] = variants;
    await addToCart(a!.id, 1);
    const body = orderBody((await quote()).total);
    let release!: () => void;
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "orders"."carts" WHERE "account_id" = ${accountId}::uuid FOR UPDATE`;
        locked();
        await new Promise<void>((resolve) => (release = resolve));
      },
      { timeout: 15_000 },
    );
    await isLocked;
    const started = Date.now();
    const res = await call("post", "/api/v1/orders").send(body).expect(409);
    expect(codeOf(res.body)).toBe("PANIER_OCCUPE");
    expect(Date.now() - started).toBeLessThan(6_000);
    release();
    await holder;
    expect(await stockOf(a!.id)).toBe(50);
    await call("post", "/api/v1/orders").send(body).expect(201);
  });
});
