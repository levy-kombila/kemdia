import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  CouponPageSchema,
  CouponSchema,
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
import { OverdueOrdersScheduler } from "../src/modules/orders/infrastructure/overdue-orders.js";
import { testDatabaseUrl } from "./integration-db.js";
import { confirmSecondFactor } from "./second-factor-helper.js";

/**
 * Coupons sur une VRAIE base (S5-T03, ADR-0025), par HTTP : création par un administrateur (journal d'audit), devis,
 * commande avec réduction, comptage atomique (BR-030), remise à l'annulation, BR-031, règles de la base.
 * Coupons et commandes ne s'effacent jamais : codes et comptes neufs à chaque test.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;
const newCode = (prefix = "TEST") => `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;

const ADDRESS = {
  fullName: "Marie Nze",
  phone: "077 12 34 56",
  cityId: "libreville",
  neighborhood: "Glass",
  landmark: "Portail bleu face à la pharmacie",
};

describe("Coupons (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin = { token: "", accountId: "" };
  let client = { token: "", accountId: "" };
  let variants: { id: string; price: number }[] = [];

  const call = (method: "get" | "post" | "patch", url: string, token: string) => {
    const server = request(app.getHttpServer());
    const req =
      method === "get" ? server.get(url) : method === "post" ? server.post(url) : server.patch(url);
    return req.set("X-Kemdia-Internal-Key", INTERNAL_KEY).set("Authorization", `Bearer ${token}`);
  };
  const createCoupon = async (body: Record<string, unknown>) =>
    matches(
      CouponSchema,
      (await call("post", "/api/v1/admin/coupons", admin.token).send(body).expect(201)).body,
    );
  const addToCart = (variantId: string, quantity: number, token = client.token) =>
    call("post", "/api/v1/cart/items", token).send({ variantId, quantity }).expect(200);
  const quote = async (couponCode?: string, token = client.token) =>
    matches(
      OrderQuoteSchema,
      (
        await call("post", "/api/v1/orders/quote", token)
          .send({ cityId: "libreville", ...(couponCode ? { couponCode } : {}) })
          .expect(200)
      ).body,
    );
  const orderBody = (expectedTotal: number, couponCode?: string) => ({
    idempotencyKey: randomUUID(),
    expectedTotal,
    delivery: ADDRESS,
    payment: { method: "airtel", phone: "077 12 34 56" },
    ...(couponCode ? { couponCode } : {}),
  });
  const placeOrder = async (couponCode?: string, token = client.token): Promise<Order> => {
    const { total } = await quote(couponCode, token);
    return matches(
      OrderSchema,
      (await call("post", "/api/v1/orders", token).send(orderBody(total, couponCode)).expect(201))
        .body,
    );
  };
  const usedCount = async (code: string) =>
    (await prisma.coupon.findUniqueOrThrow({ where: { code } })).usedCount;

  async function openSession(role?: "ADMIN"): Promise<{ token: string; accountId: string }> {
    const email = `coupon.${randomUUID()}@exemple.ga`;
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
  });

  afterAll(async () => {
    await app.close();
  });

  it("administration : création (journal d'audit), code unique sans casse, règles vérifiées, réservé aux administrateurs", async () => {
    const code = newCode("BIENVENUE");
    const coupon = await createCoupon({
      code: code.toLowerCase(),
      kind: "percent",
      value: 10,
      maxDiscount: 5_000,
    });
    expect(coupon).toMatchObject({
      code,
      kind: "percent",
      value: 10,
      maxDiscount: 5_000,
      perAccountLimit: 1,
      stackableWithSales: false,
      usedCount: 0,
      active: true,
    });
    const trace = await prisma.auditEvent.findFirstOrThrow({ where: { targetId: coupon.id } });
    expect(trace).toMatchObject({
      action: "coupon.created",
      actorId: admin.accountId,
      targetType: "coupon",
    });

    const duplicate = await call("post", "/api/v1/admin/coupons", admin.token)
      .send({ code, kind: "fixed", value: 1_000, minSubtotal: 1001 })
      .expect(409);
    expect(codeOf(duplicate.body)).toBe("COUPON_EXISTE");
    await call("post", "/api/v1/admin/coupons", admin.token)
      .send({ code: newCode(), kind: "percent", value: 95 })
      .expect(422);
    await call("post", "/api/v1/admin/coupons", admin.token)
      .send({ code: newCode(), kind: "fixed", value: 1_000, minSubtotal: 1001, maxDiscount: 500 })
      .expect(422);
    const forbidden = await call("post", "/api/v1/admin/coupons", client.token)
      .send({ code: newCode(), kind: "fixed", value: 1_000, minSubtotal: 1001 })
      .expect(403);
    expect(codeOf(forbidden.body)).toBe("ACCES_REFUSE");
    await call("get", "/api/v1/admin/coupons", client.token).expect(403);
  });

  it("liste et désactivation (journal d'audit) ; un coupon désactivé est refusé comme un code inconnu", async () => {
    const coupon = await createCoupon({
      code: newCode(),
      kind: "fixed",
      value: 1_000,
      minSubtotal: 1001,
    });
    const page = matches(
      CouponPageSchema,
      (await call("get", "/api/v1/admin/coupons?limit=5", admin.token).expect(200)).body,
    );
    expect(page.items.map((c) => c.id)).toContain(coupon.id);
    const off = matches(
      CouponSchema,
      (
        await call("patch", `/api/v1/admin/coupons/${coupon.id}`, admin.token)
          .send({ active: false })
          .expect(200)
      ).body,
    );
    expect(off.active).toBe(false);
    expect(
      await prisma.auditEvent.count({ where: { targetId: coupon.id, action: "coupon.updated" } }),
    ).toBe(1);
    await addToCart(variants[0]!.id, 1);
    const res = await call("post", "/api/v1/orders/quote", client.token)
      .send({ cityId: "libreville", couponCode: coupon.code })
      .expect(422);
    expect(codeOf(res.body)).toBe("COUPON_INVALIDE");
    const unknown = await call("post", "/api/v1/orders/quote", client.token)
      .send({ cityId: "libreville", couponCode: "INCONNU-123" })
      .expect(422);
    expect(codeOf(unknown.body)).toBe("COUPON_INVALIDE");
    await call("patch", `/api/v1/admin/coupons/${randomUUID()}`, admin.token)
      .send({ active: true })
      .expect(404);
  });

  it("commande avec coupon : réduction sur les articles, utilisation comptée ; une fois par compte", async () => {
    const coupon = await createCoupon({ code: newCode(), kind: "percent", value: 10 });
    const [a] = variants;
    await addToCart(a!.id, 2);
    const q = await quote(coupon.code.toLowerCase());
    const expected = Math.floor((2 * a!.price * 10) / 100);
    expect(q).toMatchObject({
      subtotal: 2 * a!.price,
      discount: expected,
      coupon: { code: coupon.code, discount: expected },
    });
    expect(q.total).toBe(q.subtotal - q.discount + q.deliveryFee);
    const order = matches(
      OrderSchema,
      (
        await call("post", "/api/v1/orders", client.token)
          .send(orderBody(q.total, coupon.code))
          .expect(201)
      ).body,
    );
    expect(order).toMatchObject({ discount: expected, couponCode: coupon.code, total: q.total });
    expect(await usedCount(coupon.code)).toBe(1);

    await addToCart(a!.id, 1);
    const again = await call("post", "/api/v1/orders/quote", client.token)
      .send({ cityId: "libreville", couponCode: coupon.code })
      .expect(409);
    expect(codeOf(again.body)).toBe("COUPON_DEJA_UTILISE");
  });

  it("total attendu sans la réduction : PRIX_MODIFIE, et rien n'est compté", async () => {
    const coupon = await createCoupon({
      code: newCode(),
      kind: "fixed",
      value: 5_000,
      minSubtotal: 5001,
    });
    await addToCart(variants[0]!.id, 1);
    const withoutCoupon = await quote();
    const res = await call("post", "/api/v1/orders", client.token)
      .send(orderBody(withoutCoupon.total, coupon.code))
      .expect(409);
    expect(codeOf(res.body)).toBe("PRIX_MODIFIE");
    expect(await usedCount(coupon.code)).toBe(0);
  });

  it("annulation ou paiement non reçu : l'utilisation est rendue et le coupon resservira", async () => {
    const coupon = await createCoupon({
      code: newCode(),
      kind: "fixed",
      value: 2_000,
      minSubtotal: 2001,
    });
    await addToCart(variants[0]!.id, 1);
    const first = await placeOrder(coupon.code);
    expect(await usedCount(coupon.code)).toBe(1);
    await call("post", `/api/v1/orders/${first.reference}/cancel`, client.token).expect(200);
    expect(await usedCount(coupon.code)).toBe(0);

    await addToCart(variants[0]!.id, 1);
    const second = await placeOrder(coupon.code);
    expect(await usedCount(coupon.code)).toBe(1);
    await prisma.order.update({
      where: { id: second.id },
      data: { paymentDueAt: new Date(Date.now() - 60_000) },
    });
    await app.get(OverdueOrdersScheduler).run(new Date());
    expect(await usedCount(coupon.code)).toBe(0);
    const released = await prisma.couponRedemption.findMany({
      where: { orderId: { in: [first.id, second.id] } },
    });
    expect(released.every((r) => r.releasedAt !== null)).toBe(true);
  });

  it("BR-030 : limite d'utilisations comptée de façon atomique — deux clients pour la dernière, un seul l'obtient", async () => {
    const coupon = await createCoupon({
      code: newCode(),
      kind: "fixed",
      value: 1_000,
      minSubtotal: 1001,
      usageLimit: 1,
    });
    const other = await openSession();
    await addToCart(variants[0]!.id, 1);
    await addToCart(variants[1]!.id, 1, other.token);
    const totals = [
      (await quote(coupon.code)).total,
      (await quote(coupon.code, other.token)).total,
    ];
    const results = await Promise.all([
      call("post", "/api/v1/orders", client.token).send(orderBody(totals[0]!, coupon.code)),
      call("post", "/api/v1/orders", other.token).send(orderBody(totals[1]!, coupon.code)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(codeOf(results.find((r) => r.status === 409)!.body)).toBe("COUPON_EPUISE");
    expect(await usedCount(coupon.code)).toBe(1);
    // La commande refusée n'a rien gardé : ni stock, ni utilisation
    const loser = results[0].status === 409 ? variants[0]! : variants[1]!;
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: loser.id } })).stock).toBe(
      50,
    );
  });

  it("BR-031 : pas sur un article déjà en promotion, sauf coupon cumulable ; minimum de commande", async () => {
    const plain = await createCoupon({ code: newCode(), kind: "percent", value: 10 });
    const stackable = await createCoupon({
      code: newCode(),
      kind: "percent",
      value: 10,
      stackableWithSales: true,
    });
    const minimum = await createCoupon({
      code: newCode(),
      kind: "fixed",
      value: 1_000,
      minSubtotal: 10_000_000,
    });
    const [a] = variants;
    await prisma.productVariant.update({
      where: { id: a!.id },
      data: { compareAtPrice: a!.price + 10_000 },
    });
    await addToCart(a!.id, 1);
    const refused = await call("post", "/api/v1/orders/quote", client.token)
      .send({ cityId: "libreville", couponCode: plain.code })
      .expect(422);
    expect(codeOf(refused.body)).toBe("COUPON_NON_APPLICABLE");
    expect((await quote(stackable.code)).discount).toBe(Math.floor(a!.price / 10));
    const tooSmall = await call("post", "/api/v1/orders/quote", client.token)
      .send({ cityId: "libreville", couponCode: minimum.code })
      .expect(422);
    expect(codeOf(tooSmall.body)).toBe("COUPON_MINIMUM_NON_ATTEINT");
  });

  it("dates : pas encore valable, expiré", async () => {
    const future = await createCoupon({
      code: newCode(),
      kind: "fixed",
      value: 1_000,
      minSubtotal: 1001,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const past = await createCoupon({
      code: newCode(),
      kind: "fixed",
      value: 1_000,
      minSubtotal: 1001,
      startsAt: "2020-01-01T00:00:00.000Z",
      endsAt: "2021-01-01T00:00:00.000Z",
    });
    await addToCart(variants[0]!.id, 1);
    for (const [coupon, code] of [
      // Pas encore valable : même réponse qu'un code inconnu
      [future, "COUPON_INVALIDE"],
      [past, "COUPON_EXPIRE"],
    ] as const) {
      const res = await call("post", "/api/v1/orders/quote", client.token)
        .send({ cityId: "libreville", couponCode: coupon.code })
        .expect(422);
      expect(codeOf(res.body)).toBe(code);
    }
  });

  it("montant fixe : minimum obligatoire et supérieur au montant ; réglages démesurés refusés", async () => {
    for (const body of [
      { code: newCode(), kind: "fixed", value: 5_000 },
      { code: newCode(), kind: "fixed", value: 5_000, minSubtotal: 5_000 },
    ]) {
      await call("post", "/api/v1/admin/coupons", admin.token).send(body).expect(422);
    }
    await call("post", "/api/v1/admin/coupons", admin.token)
      .send({ code: newCode(), kind: "percent", value: 10, usageLimit: 3_000_000_000 })
      .expect(400);
  });

  it("10 codes refusés en 15 minutes : COUPON_TROP_D_ESSAIS (429), même avec un bon code ensuite", async () => {
    const good = await createCoupon({ code: newCode(), kind: "percent", value: 10 });
    await addToCart(variants[0]!.id, 1);
    for (let i = 0; i < 10; i++) {
      await call("post", "/api/v1/orders/quote", client.token)
        .send({ cityId: "libreville", couponCode: `FAUX-${i}${randomBytes(2).toString("hex")}` })
        .expect(422);
    }
    const blocked = await call("post", "/api/v1/orders/quote", client.token)
      .send({ cityId: "libreville", couponCode: good.code })
      .expect(429);
    expect(codeOf(blocked.body)).toBe("COUPON_TROP_D_ESSAIS");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // Un autre compte n'est pas concerné
    const other = await openSession();
    await addToCart(variants[0]!.id, 1, other.token);
    expect((await quote(good.code, other.token)).discount).toBeGreaterThan(0);
  });

  it("panier vide : le code n'est pas regardé (PANIER_VIDE), rien n'indique s'il existe", async () => {
    const coupon = await createCoupon({ code: newCode(), kind: "percent", value: 10 });
    const res = await call("post", "/api/v1/orders/quote", client.token)
      .send({ cityId: "libreville", couponCode: coupon.code })
      .expect(409);
    expect(codeOf(res.body)).toBe("PANIER_VIDE");
  });

  it("filet de sécurité : une commande annulée par un autre chemin rend aussi son coupon (déclencheur)", async () => {
    const coupon = await createCoupon({ code: newCode(), kind: "percent", value: 10 });
    await addToCart(variants[0]!.id, 1);
    const order = await placeOrder(coupon.code);
    expect(await usedCount(coupon.code)).toBe(1);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "CLIENT" },
    });
    expect(await usedCount(coupon.code)).toBe(0);
    expect(
      (await prisma.couponRedemption.findUniqueOrThrow({ where: { orderId: order.id } }))
        .releasedAt,
    ).not.toBeNull();
  });

  it("la base protège coupons et utilisations : règles figées, compteur borné, rien ne s'efface", async () => {
    const coupon = await createCoupon({
      code: newCode(),
      kind: "fixed",
      value: 1_000,
      minSubtotal: 1001,
      usageLimit: 1,
    });
    await expect(
      prisma.coupon.update({ where: { id: coupon.id }, data: { value: 90_000 } }),
    ).rejects.toThrow();
    await expect(
      prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: 2 } }),
    ).rejects.toThrow();
    await expect(prisma.coupon.delete({ where: { id: coupon.id } })).rejects.toThrow();
    await addToCart(variants[0]!.id, 1);
    const order = await placeOrder(coupon.code);
    await expect(
      prisma.couponRedemption.updateMany({ where: { orderId: order.id }, data: { amount: 1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.couponRedemption.deleteMany({ where: { orderId: order.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.order.update({ where: { id: order.id }, data: { discount: 0, couponCode: null } }),
    ).rejects.toThrow();
    // Activation et désactivation restent possibles
    await prisma.coupon.update({ where: { id: coupon.id }, data: { active: false } });
  });
});
