import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  AvailabilityResponseSchema,
  CartSchema,
  MAX_PENDING_PRODUCTS_PER_SHOP,
  KEMDIA_SHOP_ID,
  ModerationProductPageSchema,
  ModerationProductSchema,
  ProblemDetailsSchema,
  ShopSchema,
  VendorProductPageSchema,
  VendorProductSchema,
  type ModerationProductPage,
  type VendorProduct,
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
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Produits des vendeurs et modération sur une VRAIE base (S6-T02, ADR-0033), par HTTP : création par un vendeur à
 * boutique active, invisibilité jusqu'à la validation (BR-003), modification, stock protégé, isolement entre
 * boutiques, suspension de la boutique, droits de la modération, règles de la base.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;

type Session = { token: string; accountId: string };

describe("Produits des vendeurs et modération (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Session;
  let moderator: Session;
  let vendor: Session;
  let shopId = "";
  let categoryId = "";

  const call = (method: "get" | "post" | "put" | "patch", url: string, token?: string) => {
    const server = request(app.getHttpServer());
    const req =
      method === "get"
        ? server.get(url)
        : method === "post"
          ? server.post(url)
          : method === "put"
            ? server.put(url)
            : server.patch(url);
    const withKey = req.set("X-Kemdia-Internal-Key", INTERNAL_KEY);
    return token ? withKey.set("Authorization", `Bearer ${token}`) : withKey;
  };

  const newProduct = (title = `Pagne wax ${randomBytes(3).toString("hex")}`) => ({
    title,
    description: "Pagne wax 100 % coton, 6 yards, motifs variés, cousu à Libreville.",
    brand: "Atelier Awa",
    categoryId,
    variants: [
      { name: "Rouge", attributes: { couleur: "Rouge" }, price: 15_000, stock: 5 },
      {
        name: "Bleu",
        attributes: { couleur: "Bleu" },
        price: 16_000,
        compareAtPrice: 18_000,
        stock: 2,
      },
    ],
  });
  const create = async (token = vendor.token, body: object = newProduct()) =>
    matches(
      VendorProductSchema,
      (await call("post", "/api/v1/vendors/products", token).send(body).expect(201)).body,
    );
  /**
   * Décision de modération sur la version lue par le modérateur (`submittedAt`, relu en base sauf si `seen` est donné),
   * avec le statut HTTP attendu.
   */
  const moderate = async (
    productId: string,
    decision: "approve" | "reject",
    status: number,
    reason?: string,
    seen?: string,
  ) => {
    const row = await prisma.product.findUnique({ where: { id: productId.toLowerCase() } });
    const submittedAt = seen ?? (row?.submittedAt ?? new Date(0)).toISOString();
    const res = await call(
      "post",
      `/api/v1/moderation/products/${productId}/${decision}`,
      moderator.token,
    ).send(reason === undefined ? { submittedAt } : { reason, submittedAt });
    expect(res.status).toBe(status);
    return res;
  };
  const publicStatus = async (slug: string) =>
    (await call("get", `/api/v1/products/${slug}`)).status;
  const available = async (variantId: string) =>
    matches(
      AvailabilityResponseSchema,
      (
        await call("post", "/api/v1/availability")
          .send({ lines: [{ variantId, quantity: 1 }] })
          .expect(200)
      ).body,
    ).ok;

  async function openSession(role?: "ADMIN" | "MODERATOR"): Promise<Session> {
    const email = `produits.${randomUUID()}@exemple.ga`;
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
    return { token: opened.token, accountId: account.id };
  }

  /** Un compte avec une boutique validée (rôle vendeur accordé par la validation). */
  async function openVendor(): Promise<{ session: Session; shopId: string }> {
    const session = await openSession();
    const shop = matches(
      ShopSchema,
      (
        await call("post", "/api/v1/vendors/shop", session.token)
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
    return { session, shopId: shop.id };
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
    categoryId = (await prisma.category.findFirstOrThrow({ orderBy: { slug: "asc" } })).id;
  });

  beforeEach(async () => {
    admin = await openSession("ADMIN");
    moderator = await openSession("MODERATOR");
    ({ session: vendor, shopId } = await openVendor());
  });

  afterAll(async () => {
    await app.close();
  });

  it("création → invisible → validée → visible et commandable", async () => {
    const product = await create();
    expect(product).toMatchObject({
      status: "pending",
      visible: false,
      moderationReason: null,
      images: [],
    });
    expect(product.variants.map((v) => v.sku)).toEqual([
      expect.stringMatching(/^V[A-Z0-9]{8}-1$/),
      expect.stringMatching(/^V[A-Z0-9]{8}-2$/),
    ]);
    expect(product).not.toHaveProperty("reviewedBy");
    const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row.shopId).toBe(shopId);

    // Invisible des clients : fiche, recherche, panier
    expect(await publicStatus(product.slug)).toBe(404);
    expect(await available(product.variants[0]!.id)).toBe(false);

    // La file de modération la contient (toutes les pages)
    const ids: string[] = [];
    let after: string | null = null;
    do {
      const page: ModerationProductPage = matches(
        ModerationProductPageSchema,
        (
          await call(
            "get",
            `/api/v1/moderation/products?limit=2${after ? `&after=${after}` : ""}`,
            moderator.token,
          ).expect(200)
        ).body,
      );
      ids.push(...page.items.map((p) => p.id));
      after = page.nextCursor;
    } while (after);
    expect(ids).toContain(product.id);

    const approved = matches(
      ModerationProductSchema,
      (await moderate(product.id.toUpperCase(), "approve", 200)).body,
    );
    expect(approved).toMatchObject({
      status: "published",
      visible: true,
      reviewedBy: moderator.accountId,
      shop: { id: shopId, status: "active" },
    });
    expect(await publicStatus(product.slug)).toBe(200);
    expect(await available(product.variants[0]!.id)).toBe(true);
    const events = await prisma.auditEvent.findMany({
      where: { targetId: product.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual(["product.submitted", "product.approved"]);
    expect(events[1]).toMatchObject({ actorId: moderator.accountId, targetType: "product" });
  });

  it("prix et stock changent sans modération ; le contenu repasse en modération", async () => {
    const product = await create();
    await moderate(product.id, "approve", 200);
    const variant = product.variants[0]!;
    const url = `/api/v1/vendors/products/${product.id}/variants/${variant.id}`;

    const priced = matches(
      VendorProductSchema,
      (await call("patch", url, vendor.token).send({ price: 14_000 }).expect(200)).body,
    );
    expect(priced).toMatchObject({ status: "published", visible: true });
    expect(priced.variants[0]?.price).toBe(14_000);

    // Stock : refusé si une commande l'a changé depuis la lecture
    expect(
      codeOf(
        (await call("patch", url, vendor.token).send({ stock: 9, previousStock: 4 }).expect(409))
          .body,
      ),
    ).toBe("STOCK_MODIFIE");
    await call("patch", url, vendor.token).send({ stock: 9, previousStock: 5 }).expect(200);
    await call("patch", url, vendor.token).send({ stock: 9 }).expect(400);

    // Prix barré plus bas que le prix : refusé, rien n'est écrit
    expect(
      codeOf(
        (await call("patch", url, vendor.token).send({ compareAtPrice: 1_000 }).expect(422)).body,
      ),
    ).toBe("PRODUIT_INVALIDE");

    const edited = matches(
      VendorProductSchema,
      (
        await call("put", `/api/v1/vendors/products/${product.id}`, vendor.token)
          .send({
            title: "Pagne wax premium",
            description: product.description,
            brand: null,
            categoryId,
          })
          .expect(200)
      ).body,
    );
    expect(edited).toMatchObject({ status: "pending", visible: false, brand: null });
    expect(edited.variants[0]).toMatchObject({ price: 14_000, stock: 9 });
    expect(await publicStatus(product.slug)).toBe(404);
  });

  it("refus avec motif ; archivage et remise en vente", async () => {
    const product = await create();
    await moderate(product.id, "reject", 400);
    expect(codeOf((await moderate(product.id, "reject", 422, "non")).body)).toBe(
      "PRODUIT_INVALIDE",
    );
    await moderate(product.id, "reject", 200, "Description trompeuse");
    const mine = matches(
      VendorProductSchema,
      (await call("get", `/api/v1/vendors/products/${product.id}`, vendor.token).expect(200)).body,
    );
    expect(mine).toMatchObject({ status: "rejected", moderationReason: "Description trompeuse" });
    expect(codeOf((await moderate(product.id, "approve", 409)).body)).toBe(
      "STATUT_PRODUIT_INCOMPATIBLE",
    );
    const archived = matches(
      VendorProductSchema,
      (
        await call("post", `/api/v1/vendors/products/${product.id}/archive`, vendor.token)
          .send({})
          .expect(200)
      ).body,
    );
    expect(archived.status).toBe("archived");
    await call("put", `/api/v1/vendors/products/${product.id}`, vendor.token)
      .send({ title: "Autre titre", description: product.description, categoryId })
      .expect(409);
    const restored = matches(
      VendorProductSchema,
      (
        await call("post", `/api/v1/vendors/products/${product.id}/restore`, vendor.token)
          .send({})
          .expect(200)
      ).body,
    );
    expect(restored.status).toBe("pending");
    const list = matches(
      VendorProductPageSchema,
      (await call("get", "/api/v1/vendors/products?status=pending", vendor.token).expect(200)).body,
    );
    expect(list.items.map((p) => p.id)).toContain(product.id);
  });

  it("une boutique ne voit ni ne touche les produits d'une autre (404)", async () => {
    const product = await create();
    const other = await openVendor();
    const asOther = (method: "get" | "put" | "post", path: string) =>
      call(method, `/api/v1/vendors/products/${product.id}${path}`, other.session.token);
    expect(codeOf((await asOther("get", "").expect(404)).body)).toBe("PRODUIT_INTROUVABLE");
    await asOther("put", "")
      .send({ title: "Titre détourné", description: product.description, categoryId })
      .expect(404);
    await asOther("post", "/archive").send({}).expect(404);
    const otherList = matches(
      VendorProductPageSchema,
      (await call("get", "/api/v1/vendors/products", other.session.token).expect(200)).body,
    );
    expect(otherList.items).toEqual([]);
  });

  it("boutique suspendue : produits cachés, vendeur bloqué ; réactivée : tout revient", async () => {
    const product = await create();
    await moderate(product.id, "approve", 200);
    expect(await publicStatus(product.slug)).toBe(200);

    await call("post", `/api/v1/admin/shops/${shopId}/suspend`, admin.token)
      .send({ reason: "Contrefaçons signalées" })
      .expect(200);
    expect(await publicStatus(product.slug)).toBe(404);
    expect(await available(product.variants[0]!.id)).toBe(false);
    // Le rôle vendeur est retiré à la suspension : la route le refuse d'abord
    expect(
      codeOf((await call("get", "/api/v1/vendors/products", vendor.token).expect(403)).body),
    ).toBe("ACCES_REFUSE");

    await call("post", `/api/v1/admin/shops/${shopId}/approve`, admin.token).send({}).expect(200);
    expect(await publicStatus(product.slug)).toBe(200);
    expect(await available(product.variants[0]!.id)).toBe(true);
  });

  it("rôle vendeur sans boutique active : BOUTIQUE_INACTIVE ; client simple : refusé", async () => {
    const client = await openSession();
    await call("get", "/api/v1/vendors/products", client.token).expect(403);
    // Rôle accordé à la main (S4-T06) sans boutique : la route laisse passer, le cas d'utilisation refuse
    await prisma.accountRole.create({ data: { accountId: client.accountId, role: "VENDOR" } });
    expect(
      codeOf(
        (
          await call("post", "/api/v1/vendors/products", client.token)
            .send(newProduct())
            .expect(403)
        ).body,
      ),
    ).toBe("BOUTIQUE_INACTIVE");
  });

  it("modération : réservée, jamais sur sa propre boutique ; produits Kemdia hors modération", async () => {
    const product = await create();
    await call("get", "/api/v1/moderation/products", vendor.token).expect(403);
    // Un modérateur qui est aussi vendeur ne modère pas ses propres produits
    await prisma.accountRole.create({ data: { accountId: vendor.accountId, role: "MODERATOR" } });
    expect(
      codeOf(
        (
          await call("post", `/api/v1/moderation/products/${product.id}/approve`, vendor.token)
            .send({ submittedAt: product.submittedAt })
            .expect(403)
        ).body,
      ),
    ).toBe("PRODUIT_SUR_SOI_INTERDIT");
    const kemdia = await prisma.product.findFirstOrThrow({ where: { shopId: KEMDIA_SHOP_ID } });
    expect(codeOf((await moderate(kemdia.id, "approve", 404)).body)).toBe("PRODUIT_INTROUVABLE");
  });

  it("saisie vérifiée : catégorie inconnue, variantes en double, prix barré", async () => {
    const send = (body: object) =>
      call("post", "/api/v1/vendors/products", vendor.token).send(body);
    expect(
      codeOf((await send({ ...newProduct(), categoryId: randomUUID() }).expect(422)).body),
    ).toBe("CATEGORIE_INCONNUE");
    const twins = newProduct();
    twins.variants[1]!.name = " rouge ";
    expect(codeOf((await send(twins).expect(422)).body)).toBe("PRODUIT_INVALIDE");
    const cheap = newProduct();
    cheap.variants[1]!.compareAtPrice = 100;
    expect(codeOf((await send(cheap).expect(422)).body)).toBe("PRODUIT_INVALIDE");
    expect(await prisma.product.count({ where: { shopId } })).toBe(0);
  });

  it("la base refuse ce que le domaine refuse (défense en profondeur)", async () => {
    const product: VendorProduct = await create();
    const kemdia = await prisma.product.findFirstOrThrow({ where: { shopId: KEMDIA_SHOP_ID } });
    // Produit Kemdia en modération ou caché par une suspension
    await expect(
      prisma.product.update({
        where: { id: kemdia.id },
        data: { status: "PENDING", submittedAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.product.update({ where: { id: kemdia.id }, data: { shopSuspended: true } }),
    ).rejects.toThrow();
    // Refusé sans motif, motif sans refus
    await expect(
      prisma.product.update({ where: { id: product.id }, data: { status: "REJECTED" } }),
    ).rejects.toThrow();
    await expect(
      prisma.product.update({
        where: { id: product.id },
        data: { moderationReason: "Motif valable" },
      }),
    ).rejects.toThrow();
  });

  it("relecture S6-T02 : jamais une version que le modérateur n'a pas lue", async () => {
    const product = await create();
    const seen = matches(
      ModerationProductSchema,
      (await call("get", `/api/v1/moderation/products/${product.id}`, moderator.token).expect(200))
        .body,
    );
    // Le vendeur change le contenu pendant que le modérateur lit la fiche
    await call("put", `/api/v1/vendors/products/${product.id}`, vendor.token)
      .send({
        title: "Arnaque appelez le 077000000",
        description: "Payez d'abord par Mobile Money au 077000000, livraison ensuite.",
        categoryId,
      })
      .expect(200);
    const stale = await moderate(product.id, "approve", 409, undefined, seen.submittedAt!);
    expect(codeOf(stale.body)).toBe("PRODUIT_MODIFIE");
    expect(await publicStatus(product.slug)).toBe(404);
    await moderate(product.id, "reject", 409, "Ancienne version", seen.submittedAt!);
    // Relu, le modérateur décide sur la bonne version
    await moderate(product.id, "reject", 200, "Arnaque au paiement");
  });

  it("relecture S6-T02 : le panier ne montre pas un titre non modéré", async () => {
    const product = await create();
    await moderate(product.id, "approve", 200);
    const client = await openSession();
    await call("post", "/api/v1/cart/items", client.token)
      .send({ variantId: product.variants[0]!.id, quantity: 1 })
      .expect(200);
    await call("put", `/api/v1/vendors/products/${product.id}`, vendor.token)
      .send({ title: "Titre jamais modéré", description: product.description, categoryId })
      .expect(200);
    const cart = matches(
      CartSchema,
      (await call("get", "/api/v1/cart", client.token).expect(200)).body,
    );
    expect(cart.lines[0]).toMatchObject({ title: "Produit indisponible", image: null });
  });

  it("relecture S6-T02 : file de modération bornée à 50 produits en attente par boutique", async () => {
    const at = new Date();
    await prisma.product.createMany({
      data: Array.from({ length: MAX_PENDING_PRODUCTS_PER_SHOP }, (_, i) => ({
        id: randomUUID(),
        shopId,
        slug: `attente-${randomBytes(4).toString("hex")}-${i}`,
        title: `Produit en attente ${i}`,
        categoryId,
        status: "PENDING" as const,
        submittedAt: at,
        price: 1_000,
      })),
    });
    expect(
      codeOf(
        (
          await call("post", "/api/v1/vendors/products", vendor.token)
            .send(newProduct())
            .expect(409)
        ).body,
      ),
    ).toBe("TROP_DE_PRODUITS_EN_ATTENTE");
  });

  it("relecture S6-T02 : prix, stock et archivage tracés ; dernière variante active protégée", async () => {
    const product = await create();
    const [red, blue] = product.variants;
    const url = (id: string) => `/api/v1/vendors/products/${product.id}/variants/${id}`;
    await call("patch", url(red!.id), vendor.token).send({ price: 12_000 }).expect(200);
    await call("patch", url(blue!.id), vendor.token).send({ isActive: false }).expect(200);
    expect(
      codeOf(
        (await call("patch", url(red!.id), vendor.token).send({ isActive: false }).expect(409))
          .body,
      ),
    ).toBe("STATUT_PRODUIT_INCOMPATIBLE");
    await call("post", `/api/v1/vendors/products/${product.id}/archive`, vendor.token)
      .send({})
      .expect(200);
    const events = await prisma.auditEvent.findMany({
      where: { targetId: product.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual([
      "product.submitted",
      "product.variant_updated",
      "product.variant_updated",
      "product.archived",
    ]);
    expect(events[1]?.details).toMatchObject({ priceFrom: 15_000, priceTo: 12_000 });
  });
});
