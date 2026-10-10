import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import { CartMergedSchema, CartSchema, ProblemDetailsSchema, type Cart } from "@kemdia/contracts";
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
import { CartCleanupScheduler } from "../src/modules/orders/infrastructure/cart-cleanup.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Panier serveur sur une VRAIE base (S5-T01, ADR-0023), de bout en bout par HTTP : session réelle,
 * catalogue de démonstration importé, réponses confrontées au contrat. Vérifie aussi les règles SQL
 * (quantité, 50 lignes) et le retrait des colonnes obsolètes (étape 2 de l'ADR-0022).
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;

describe("Panier serveur (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let awa = "";
  let ben = "";
  let awaAccountId = "";
  /** Variantes du catalogue de démonstration : [0] stock généreux, [1] pour les changements de prix, etc. */
  let variants: { id: string; price: number; productId: string }[] = [];

  const call = (method: "get" | "post" | "put" | "delete", url: string, token = awa) => {
    const server = request(app.getHttpServer());
    const req =
      method === "get"
        ? server.get(url)
        : method === "post"
          ? server.post(url)
          : method === "put"
            ? server.put(url)
            : server.delete(url);
    return req.set("X-Kemdia-Internal-Key", INTERNAL_KEY).set("Authorization", `Bearer ${token}`);
  };
  const cart = (res: request.Response): Cart => matches(CartSchema, res.body);

  async function openSession(email: string): Promise<{ token: string; accountId: string }> {
    const accounts = new PrismaAccountRepository(prisma);
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
    await accounts.save(account);
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
    await prisma.$executeRawUnsafe('TRUNCATE "orders"."carts", "orders"."cart_items" CASCADE');
    await prisma.$executeRawUnsafe(
      'TRUNCATE "identity"."account_roles", "identity"."sessions", "identity"."accounts" CASCADE',
    );
    // Catalogue remis à neuf : 50 en stock partout, produits publiés
    await prisma.$executeRawUnsafe(
      `UPDATE "catalog"."product_variants" SET "stock" = 50, "is_active" = true`,
    );
    await prisma.$executeRawUnsafe(`UPDATE "catalog"."products" SET "status" = 'PUBLISHED'`);
    variants = (
      await prisma.productVariant.findMany({
        select: { id: true, price: true, productId: true },
        orderBy: { sku: "asc" },
      })
    ).map((v) => ({ id: v.id, price: v.price, productId: v.productId }));
    ({ token: awa, accountId: awaAccountId } = await openSession("awa@exemple.ga"));
    ({ token: ben } = await openSession("ben@exemple.ga"));
  });

  afterAll(async () => {
    await app.close();
  });

  it("sans session valable : 401 SESSION_INVALIDE", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/cart")
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
      .expect(401);
    expect(codeOf(res.body)).toBe("SESSION_INVALIDE");
  });

  it("panier vide au départ, sans rien créer en base ; jamais mis en cache", async () => {
    const res = await call("get", "/api/v1/cart").expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(cart(res)).toEqual({ lines: [], itemCount: 0, subtotal: 0, ok: false });
    expect(await prisma.cart.count()).toBe(0);
  });

  it("ajoute, additionne, et calcule le total avec le prix du CATALOGUE (BR-004)", async () => {
    const [v] = variants;
    await call("post", "/api/v1/cart/items").send({ variantId: v!.id, quantity: 2 }).expect(200);
    const body = cart(
      await call("post", "/api/v1/cart/items").send({ variantId: v!.id, quantity: 1 }).expect(200),
    );
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toMatchObject({
      variantId: v!.id,
      productId: v!.productId,
      price: v!.price,
      quantity: 3,
      maxQuantity: 20,
      ok: true,
    });
    expect(body).toMatchObject({ itemCount: 3, subtotal: 3 * v!.price, ok: true });
  });

  it("refuse un prix envoyé par le site, une quantité hors limites, un identifiant invalide (400)", async () => {
    const variantId = variants[0]!.id;
    await call("post", "/api/v1/cart/items").send({ variantId, quantity: 1, price: 1 }).expect(400);
    await call("post", "/api/v1/cart/items").send({ variantId, quantity: 21 }).expect(400);
    await call("post", "/api/v1/cart/items").send({ variantId, quantity: 0 }).expect(400);
    await call("put", "/api/v1/cart/items/pas-un-uuid").send({ quantity: 1 }).expect(400);
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("BR-001 : variante inconnue (404), sans stock ou plus en vente (409) ; rien n'est ajouté", async () => {
    const [a, b] = variants;
    const unknown = await call("post", "/api/v1/cart/items")
      .send({ variantId: randomUUID(), quantity: 1 })
      .expect(404);
    expect(codeOf(unknown.body)).toBe("VARIANTE_INCONNUE");
    await prisma.productVariant.update({ where: { id: a!.id }, data: { stock: 0 } });
    const empty = await call("post", "/api/v1/cart/items")
      .send({ variantId: a!.id, quantity: 1 })
      .expect(409);
    expect(codeOf(empty.body)).toBe("PRODUIT_INDISPONIBLE");
    await prisma.product.update({ where: { id: b!.productId }, data: { status: "ARCHIVED" } });
    const archived = await call("post", "/api/v1/cart/items")
      .send({ variantId: b!.id, quantity: 1 })
      .expect(409);
    expect(codeOf(archived.body)).toBe("PRODUIT_INDISPONIBLE");
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("ramène la quantité au stock disponible", async () => {
    const [v] = variants;
    await prisma.productVariant.update({ where: { id: v!.id }, data: { stock: 3 } });
    const body = cart(
      await call("post", "/api/v1/cart/items").send({ variantId: v!.id, quantity: 5 }).expect(200),
    );
    expect(body.lines[0]).toMatchObject({ quantity: 3, maxQuantity: 3, ok: true });
  });

  it("modifie une quantité, retire une ligne, vide le panier", async () => {
    const [a, b] = variants;
    await call("post", "/api/v1/cart/items").send({ variantId: a!.id, quantity: 1 }).expect(200);
    await call("post", "/api/v1/cart/items").send({ variantId: b!.id, quantity: 1 }).expect(200);
    let body = cart(
      await call("put", `/api/v1/cart/items/${a!.id}`).send({ quantity: 4 }).expect(200),
    );
    expect(body.lines.map((l) => [l.variantId, l.quantity])).toEqual([
      [a!.id, 4],
      [b!.id, 1],
    ]);
    body = cart(await call("delete", `/api/v1/cart/items/${a!.id}`).expect(200));
    expect(body.lines.map((l) => l.variantId)).toEqual([b!.id]);
    // Retirer une ligne absente : sans effet
    await call("delete", `/api/v1/cart/items/${a!.id}`).expect(200);
    body = cart(await call("delete", "/api/v1/cart").expect(200));
    expect(body).toEqual({ lines: [], itemCount: 0, subtotal: 0, ok: false });
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("chaque lecture revérifie : nouveau prix, stock insuffisant, produit retiré, variante supprimée", async () => {
    const [a, b, c, d] = variants;
    for (const v of [a, b, c, d]) {
      await call("post", "/api/v1/cart/items").send({ variantId: v!.id, quantity: 2 }).expect(200);
    }
    await prisma.productVariant.update({ where: { id: a!.id }, data: { price: a!.price + 1000 } });
    await prisma.productVariant.update({ where: { id: b!.id }, data: { stock: 1 } });
    await prisma.product.update({ where: { id: c!.productId }, data: { status: "ARCHIVED" } });
    await prisma.productVariant.delete({ where: { id: d!.id } });

    const body = cart(await call("get", "/api/v1/cart").expect(200));
    expect(body.lines.map((l) => l.variantId)).toEqual([a!.id, b!.id, c!.id]);
    expect(body.lines[0]).toMatchObject({ price: a!.price + 1000, ok: true });
    expect(body.lines[1]).toMatchObject({
      ok: false,
      reason: "STOCK_INSUFFISANT",
      available: 1,
      maxQuantity: 1,
    });
    expect(body.lines[2]).toMatchObject({
      ok: false,
      reason: "PRODUIT_INDISPONIBLE",
      maxQuantity: 0,
    });
    expect(body.ok).toBe(false);
    // Seules les lignes commandables comptent dans le total
    expect(body.subtotal).toBe(2 * (a!.price + 1000));
    // La variante supprimée a été retirée du panier
    expect(await prisma.cartItem.count({ where: { variantId: d!.id } })).toBe(0);
  });

  it("réunion après la connexion : quantités additionnées, ordre conservé, lignes impossibles ignorées", async () => {
    const [a, b, c] = variants;
    await call("post", "/api/v1/cart/items").send({ variantId: a!.id, quantity: 2 }).expect(200);
    await prisma.productVariant.update({ where: { id: c!.id }, data: { stock: 0 } });
    const res = await call("post", "/api/v1/cart/merge")
      .send({
        mergeId: randomUUID(),
        lines: [
          { variantId: b!.id, quantity: 1 },
          { variantId: a!.id, quantity: 3 },
          { variantId: c!.id, quantity: 1 },
          { variantId: randomUUID(), quantity: 1 },
        ],
      })
      .expect(200);
    const body = matches(CartMergedSchema, res.body);
    expect(body.ignored).toBe(2);
    expect(body.lines.map((l) => [l.variantId, l.quantity])).toEqual([
      [a!.id, 5],
      [b!.id, 1],
    ]);
    // Réunion d'un panier vide : rien ne change, aucun panier créé pour Ben
    const none = matches(
      CartMergedSchema,
      (
        await call("post", "/api/v1/cart/merge", ben)
          .send({ mergeId: randomUUID(), lines: [] })
          .expect(200)
      ).body,
    );
    expect(none).toEqual({ lines: [], itemCount: 0, subtotal: 0, ok: false, ignored: 0 });
    expect(await prisma.cart.count()).toBe(1);
  });

  it("réunion idempotente : renvoyée (double chargement, réponse perdue), elle ne double rien", async () => {
    const [a, b] = variants;
    const mergeId = randomUUID();
    const request = {
      mergeId,
      lines: [
        { variantId: a!.id, quantity: 2 },
        { variantId: b!.id, quantity: 1 },
      ],
    };
    // Deux envois simultanés puis un troisième : appliquée une seule fois
    await Promise.all([
      call("post", "/api/v1/cart/merge").send(request).expect(200),
      call("post", "/api/v1/cart/merge").send(request).expect(200),
    ]);
    const again = matches(
      CartMergedSchema,
      (await call("post", "/api/v1/cart/merge").send(request).expect(200)).body,
    );
    expect(again.lines.map((l) => [l.variantId, l.quantity])).toEqual([
      [a!.id, 2],
      [b!.id, 1],
    ]);
    expect(again.ignored).toBe(0);
    // Une NOUVELLE réunion (autre identifiant) s'additionne
    const next = matches(
      CartMergedSchema,
      (
        await call("post", "/api/v1/cart/merge")
          .send({ ...request, mergeId: randomUUID() })
          .expect(200)
      ).body,
    );
    expect(next.lines.map((l) => l.quantity)).toEqual([4, 2]);
    // Sans identifiant de réunion : refusé
    await call("post", "/api/v1/cart/merge").send({ lines: request.lines }).expect(400);
  });

  it("panier tenu trop longtemps par une autre demande : 409 PANIER_OCCUPE + Retry-After, sans bloquer la base", async () => {
    const [a] = variants;
    await call("post", "/api/v1/cart/items").send({ variantId: a!.id, quantity: 1 }).expect(200);
    let release!: () => void;
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "orders"."carts" WHERE "account_id" = ${awaAccountId}::uuid FOR UPDATE`;
        locked();
        await new Promise<void>((resolve) => (release = resolve));
      },
      { timeout: 15_000 },
    );
    await isLocked;
    const started = Date.now();
    const res = await call("post", "/api/v1/cart/items")
      .send({ variantId: a!.id, quantity: 1 })
      .expect(409);
    expect(codeOf(res.body)).toBe("PANIER_OCCUPE");
    expect(res.headers["retry-after"]).toBe("1");
    expect(Date.now() - started).toBeLessThan(5_000);
    release();
    await holder;
    expect(cart(await call("get", "/api/v1/cart").expect(200)).itemCount).toBe(1);
  });

  it("UUID en majuscules : la même variante, jamais deux lignes", async () => {
    const [a] = variants;
    await call("post", "/api/v1/cart/items").send({ variantId: a!.id, quantity: 1 }).expect(200);
    await call("post", "/api/v1/cart/items")
      .send({ variantId: a!.id.toUpperCase(), quantity: 1 })
      .expect(200);
    const merged = matches(
      CartMergedSchema,
      (
        await call("post", "/api/v1/cart/merge")
          .send({
            mergeId: randomUUID(),
            lines: [
              { variantId: a!.id.toUpperCase(), quantity: 1 },
              { variantId: a!.id, quantity: 1 },
            ],
          })
          .expect(200)
      ).body,
    );
    expect(merged.lines).toHaveLength(1);
    expect(merged.lines[0]).toMatchObject({ variantId: a!.id, quantity: 3 });
    expect(merged.ignored).toBe(1);
    await call("delete", `/api/v1/cart/items/${a!.id.toUpperCase()}`).expect(200);
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("chacun son panier : Ben ne voit ni ne modifie celui d'Awa", async () => {
    const [a] = variants;
    await call("post", "/api/v1/cart/items").send({ variantId: a!.id, quantity: 2 }).expect(200);
    expect(cart(await call("get", "/api/v1/cart", ben).expect(200)).lines).toEqual([]);
    await call("delete", "/api/v1/cart", ben).expect(200);
    expect(cart(await call("get", "/api/v1/cart").expect(200)).itemCount).toBe(2);
  });

  it("deux ajouts simultanés du même compte : aucun n'est perdu (panier verrouillé)", async () => {
    const [a] = variants;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        call("post", "/api/v1/cart/items").send({ variantId: a!.id, quantity: 1 }).expect(200),
      ),
    );
    expect(cart(await call("get", "/api/v1/cart").expect(200)).itemCount).toBe(6);
    expect(await prisma.cart.count()).toBe(1);
  });

  it("PANIER_PLEIN : une 51e ligne est refusée (409)", async () => {
    const [a] = variants;
    const cartId = randomUUID();
    await prisma.cart.create({
      data: {
        id: cartId,
        accountId: awaAccountId,
        items: {
          create: Array.from({ length: 50 }, () => ({ variantId: randomUUID(), quantity: 1 })),
        },
      },
    });
    const res = await call("post", "/api/v1/cart/items")
      .send({ variantId: a!.id, quantity: 1 })
      .expect(409);
    expect(codeOf(res.body)).toBe("PANIER_PLEIN");
    expect(await prisma.cartItem.count({ where: { cartId } })).toBe(50);
  });

  it("la base refuse une quantité hors limites et une 51e ligne, même si le code se trompait", async () => {
    const cartId = randomUUID();
    await prisma.cart.create({ data: { id: cartId, accountId: awaAccountId } });
    await expect(
      prisma.cartItem.create({ data: { cartId, variantId: randomUUID(), quantity: 21 } }),
    ).rejects.toThrow();
    await expect(
      prisma.cartItem.create({ data: { cartId, variantId: randomUUID(), quantity: 0 } }),
    ).rejects.toThrow();
    await prisma.cartItem.createMany({
      data: Array.from({ length: 50 }, () => ({ cartId, variantId: randomUUID(), quantity: 1 })),
    });
    await expect(
      prisma.cartItem.create({ data: { cartId, variantId: randomUUID(), quantity: 1 } }),
    ).rejects.toThrow();
  });

  it("ménage : un panier sans activité depuis plus de 90 jours est supprimé, les autres restent", async () => {
    const [a] = variants;
    await call("post", "/api/v1/cart/items").send({ variantId: a!.id, quantity: 1 }).expect(200);
    await call("post", "/api/v1/cart/items", ben)
      .send({ variantId: a!.id, quantity: 1 })
      .expect(200);
    const now = new Date();
    const old = new Date(now.getTime() - 91 * 24 * 60 * 60_000);
    await prisma.cart.updateMany({ where: { accountId: awaAccountId }, data: { updatedAt: old } });
    expect(await app.get(CartCleanupScheduler).run(now)).toBe(1);
    expect(await prisma.cart.count()).toBe(1);
    expect(await prisma.cartItem.count()).toBe(1);
  });

  it("une lecture note l'activité (au plus une fois par heure) : le panier consulté n'est pas supprimé", async () => {
    const [a] = variants;
    await call("post", "/api/v1/cart/items").send({ variantId: a!.id, quantity: 1 }).expect(200);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    await prisma.cart.updateMany({ data: { updatedAt: twoHoursAgo } });
    await call("get", "/api/v1/cart").expect(200);
    const row = await prisma.cart.findFirstOrThrow();
    expect(row.updatedAt.getTime()).toBeGreaterThan(twoHoursAgo.getTime() + 60 * 60_000);
  });
});

describe("Étape 2 de l'ADR-0022 (S5-T01)", () => {
  it("les colonnes failed_logins / locked_until et leur contrainte n'existent plus", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: testDatabaseUrl(),
    });
    const prisma = new PrismaService(config);
    try {
      const columns = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'identity' AND table_name = 'accounts'`;
      const names = columns.map((c) => c.column_name);
      expect(names).toContain("password_hash");
      expect(names).not.toContain("failed_logins");
      expect(names).not.toContain("locked_until");
      const constraints = await prisma.$queryRaw<{ conname: string }[]>`
        SELECT conname FROM pg_constraint WHERE conname = 'accounts_failed_logins_check'`;
      expect(constraints).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });
});
