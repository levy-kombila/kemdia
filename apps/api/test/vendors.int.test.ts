import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  AdminShopPageSchema,
  type AdminShopPage,
  AdminShopSchema,
  KEMDIA_SHOP_ID,
  ProblemDetailsSchema,
  ProductPageSchema,
  PublicShopPageSchema,
  PublicShopSchema,
  ShopSchema,
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
import { confirmSecondFactor } from "./second-factor-helper.js";

/**
 * Boutiques sur une VRAIE base (S6-T01, ADR-0032), par HTTP : demande, file d'attente, validation (rôle vendeur et
 * journal dans la même transaction), refus et nouvelle demande, suspension, demandes simultanées, règles de la base.
 * Les boutiques ne s'effacent pas : comptes et noms neufs à chaque test.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;
const shopName = () => `Boutique ${randomBytes(4).toString("hex")}`;
const application = (name = shopName()) => ({
  name,
  city: "Libreville",
  phone: "066 12 34 56",
  description: "Pagnes, robes et chemises cousus à Libreville sur commande.",
});

describe("Boutiques (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin = { token: "", accountId: "" };
  let client = { token: "", accountId: "" };

  const call = (method: "get" | "post", url: string, token: string) => {
    const server = request(app.getHttpServer());
    const req = method === "get" ? server.get(url) : server.post(url);
    return req.set("X-Kemdia-Internal-Key", INTERNAL_KEY).set("Authorization", `Bearer ${token}`);
  };
  const apply = (body: object, token = client.token) =>
    call("post", "/api/v1/vendors/shop", token).send(body);
  const decide = (shopId: string, decision: string, reason?: string, token = admin.token) =>
    call("post", `/api/v1/admin/shops/${shopId}/${decision}`, token).send(
      reason === undefined ? {} : { reason },
    );
  const storedRoles = async (accountId: string) =>
    (await prisma.accountRole.findMany({ where: { accountId } })).map((r) => r.role);
  const auditOf = (shopId: string) =>
    prisma.auditEvent.findMany({ where: { targetId: shopId }, orderBy: { occurredAt: "asc" } });

  async function openSession(role?: "ADMIN"): Promise<{ token: string; accountId: string }> {
    const email = `vendeur.${randomUUID()}@exemple.ga`;
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
  });

  beforeEach(async () => {
    admin = await openSession("ADMIN");
    client = await openSession();
  });

  afterAll(async () => {
    await app.close();
  });

  it("la boutique Kemdia existe et possède les produits importés", async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "catalog"."product_variants", "catalog"."products", "catalog"."categories" CASCADE',
    );
    await importCatalog(prepareDemoCatalog(demoCatalog), {
      categories: new PrismaCategoryRepository(prisma),
      products: new PrismaProductRepository(prisma),
    });
    const kemdia = await prisma.shop.findUniqueOrThrow({ where: { id: KEMDIA_SHOP_ID } });
    expect(kemdia).toMatchObject({ kind: "KEMDIA", status: "ACTIVE", ownerAccountId: null });
    const others = await prisma.product.count({ where: { shopId: { not: KEMDIA_SHOP_ID } } });
    expect(others).toBe(0);
    expect(await prisma.product.count()).toBeGreaterThan(0);
  });

  it("demande → file d'attente → validation : rôle vendeur et journal écrits ensemble", async () => {
    const name = shopName();
    const created = matches(ShopSchema, (await apply(application(name)).expect(201)).body);
    expect(created).toMatchObject({
      kind: "partner",
      name,
      status: "pending",
      phone: "+241066123456",
      statusReason: null,
      reviewedAt: null,
    });
    expect(created).not.toHaveProperty("reviewedBy");
    const mine = await call("get", "/api/v1/vendors/shop", client.token).expect(200);
    expect(mine.headers["cache-control"]).toBe("no-store");
    expect(matches(ShopSchema, mine.body).id).toBe(created.id);

    // La file d'attente (toutes les pages) contient la demande
    const ids: string[] = [];
    let after: string | null = null;
    do {
      const page: AdminShopPage = matches(
        AdminShopPageSchema,
        (
          await call(
            "get",
            `/api/v1/admin/shops?status=pending&limit=2${after ? `&after=${after}` : ""}`,
            admin.token,
          ).expect(200)
        ).body,
      );
      ids.push(...page.items.map((s) => s.id));
      after = page.nextCursor;
    } while (after);
    expect(ids).toContain(created.id);

    // Identifiant en majuscules accepté (ramené en minuscules)
    const approved = matches(
      AdminShopSchema,
      (await decide(created.id.toUpperCase(), "approve").expect(200)).body,
    );
    expect(approved).toMatchObject({
      status: "active",
      ownerAccountId: client.accountId,
      reviewedBy: admin.accountId,
    });
    expect(await storedRoles(client.accountId)).toEqual(["VENDOR"]);
    const shopEvents = await auditOf(created.id);
    expect(shopEvents.map((e) => e.action)).toEqual(["shop.requested", "shop.approved"]);
    expect(shopEvents[0]).toMatchObject({ actorId: client.accountId, targetType: "shop" });
    expect(shopEvents[1]).toMatchObject({ actorId: admin.accountId, targetType: "shop" });
    const roleEvent = await prisma.auditEvent.findFirst({
      where: { targetId: client.accountId, action: "role.granted" },
    });
    expect(roleEvent?.details).toMatchObject({ role: "vendor", source: "api" });
  });

  it("suspension : rôle retiré ; réactivation : rôle rendu", async () => {
    const shop = matches(ShopSchema, (await apply(application()).expect(201)).body);
    await decide(shop.id, "approve").expect(200);
    const suspended = matches(
      AdminShopSchema,
      (await decide(shop.id, "suspend", "Articles contrefaits signalés").expect(200)).body,
    );
    expect(suspended).toMatchObject({
      status: "suspended",
      statusReason: "Articles contrefaits signalés",
    });
    expect(await storedRoles(client.accountId)).toEqual([]);
    await decide(shop.id, "approve").expect(200);
    expect(await storedRoles(client.accountId)).toEqual(["VENDOR"]);
    expect((await auditOf(shop.id)).map((e) => e.action)).toEqual([
      "shop.requested",
      "shop.approved",
      "shop.suspended",
      "shop.approved",
    ]);
  });

  it("refus avec motif, puis nouvelle demande ; une seule boutique par compte", async () => {
    const shop = matches(ShopSchema, (await apply(application()).expect(201)).body);
    expect(codeOf((await apply(application()).expect(409)).body)).toBe("BOUTIQUE_EXISTE");
    expect(codeOf((await decide(shop.id, "reject").expect(400)).body)).toBeUndefined();
    expect(codeOf((await decide(shop.id, "reject", "non").expect(422)).body)).toBe(
      "BOUTIQUE_INVALIDE",
    );
    await decide(shop.id, "reject", "Description à préciser").expect(200);
    const mine = matches(
      ShopSchema,
      (await call("get", "/api/v1/vendors/shop", client.token).expect(200)).body,
    );
    expect(mine).toMatchObject({ status: "rejected", statusReason: "Description à préciser" });
    expect(await storedRoles(client.accountId)).toEqual([]);
    const again = matches(ShopSchema, (await apply(application()).expect(201)).body);
    expect(again).toMatchObject({ id: shop.id, status: "pending", statusReason: null });
    expect(codeOf((await decide(shop.id, "suspend", "Motif valable").expect(409)).body)).toBe(
      "STATUT_BOUTIQUE_INCOMPATIBLE",
    );
  });

  it("nom unique (casse, accents, ponctuation ignorés) ; nom « Kemdia » refusé", async () => {
    const name = shopName();
    await apply(application(name)).expect(201);
    const other = await openSession();
    const res = await apply(application(`  ${name.toUpperCase()} !`), other.token).expect(409);
    expect(codeOf(res.body)).toBe("NOM_BOUTIQUE_PRIS");
    expect(codeOf((await apply(application("Kemdia Officiel"), other.token)).body)).toBe(
      "BOUTIQUE_INVALIDE",
    );
    // Relecture de sécurité : signes ressemblants (« l » pour « i ») et petites capitales
    expect(codeOf((await apply(application("ᴋᴇᴍᴅɪᴀ Officiel"), other.token)).body)).toBe(
      "BOUTIQUE_INVALIDE",
    );
    const lookalike = await apply(application(name.replace("i", "l")), other.token);
    if (name.includes("i")) expect(codeOf(lookalike.body)).toBe("NOM_BOUTIQUE_PRIS");
  });

  it("un nom refusé est libéré : un autre demandeur peut le prendre", async () => {
    const name = shopName();
    const shop = matches(ShopSchema, (await apply(application(name)).expect(201)).body);
    const other = await openSession();
    expect(codeOf((await apply(application(name), other.token).expect(409)).body)).toBe(
      "NOM_BOUTIQUE_PRIS",
    );
    await decide(shop.id, "reject", "Nom réservé à une marque déposée").expect(200);
    matches(ShopSchema, (await apply(application(name), other.token).expect(201)).body);
    // Le premier demandeur ne peut plus reprendre ce nom tant que l'autre boutique le porte
    expect(codeOf((await apply(application(name)).expect(409)).body)).toBe("NOM_BOUTIQUE_PRIS");
    const journal = await auditOf(shop.id);
    expect(journal.map((e) => e.action)).toEqual(["shop.requested", "shop.rejected"]);
    expect(journal[1]?.details).toMatchObject({ reason: "Nom réservé à une marque déposée" });
  });

  it("deux envois simultanés du même compte ne créent qu'une boutique", async () => {
    const results = await Promise.all([apply(application()), apply(application())]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.shop.count({ where: { ownerAccountId: client.accountId } })).toBe(1);
  });

  it("compte du vendeur fermé : la validation échoue et rien n'est écrit", async () => {
    const shop = matches(ShopSchema, (await apply(application()).expect(201)).body);
    await prisma.account.update({ where: { id: client.accountId }, data: { status: "DISABLED" } });
    expect(codeOf((await decide(shop.id, "approve").expect(409)).body)).toBe(
      "PROPRIETAIRE_INACTIF",
    );
    expect((await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe(
      "PENDING",
    );
    expect((await auditOf(shop.id)).map((e) => e.action)).toEqual(["shop.requested"]);
    expect(await storedRoles(client.accountId)).toEqual([]);
  });

  it("réservé aux administrateurs ; jamais sur sa propre boutique ; boutique Kemdia intouchable", async () => {
    await call("get", "/api/v1/admin/shops", client.token).expect(403);
    const own = matches(ShopSchema, (await apply(application(), admin.token).expect(201)).body);
    expect(codeOf((await decide(own.id, "approve").expect(403)).body)).toBe(
      "BOUTIQUE_SUR_SOI_INTERDITE",
    );
    expect(
      codeOf((await decide(KEMDIA_SHOP_ID, "suspend", "Motif valable").expect(409)).body),
    ).toBe("STATUT_BOUTIQUE_INCOMPATIBLE");
    expect(codeOf((await decide(randomUUID(), "approve").expect(404)).body)).toBe(
      "BOUTIQUE_INTROUVABLE",
    );
    await call("get", "/api/v1/vendors/shop", "x".repeat(43)).expect(401);
    const none = await openSession();
    expect(codeOf((await call("get", "/api/v1/vendors/shop", none.token).expect(404)).body)).toBe(
      "BOUTIQUE_INTROUVABLE",
    );
  });

  it("la base refuse ce que le domaine refuse (défense en profondeur)", async () => {
    const insert = (values: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO "vendors"."shops" ("id", "kind", "owner_account_id", "name", "name_key", "slug", "city",
           "contact_phone", "description", "status", "status_reason", "reviewed_by", "reviewed_at",
           "submitted_at", "updated_at") VALUES (${values}, now(), now())`,
      );
    const id = () => `'${randomUUID()}'`;
    const owner = `'${client.accountId}'`;
    const desc = `'Une description suffisamment longue.'`;
    const key = () => {
      const k = randomBytes(4).toString("hex");
      return `'Nom ${k}', 'nom ${k}', 'nom-${k}'`;
    };
    // Deuxième boutique Kemdia
    await expect(
      insert(
        `${id()}, 'KEMDIA', NULL, ${key()}, 'Libreville', NULL, '', 'ACTIVE', NULL, NULL, NULL`,
      ),
    ).rejects.toThrow();
    // Vendeur sans mobile, ou mobile non gabonais
    await expect(
      insert(
        `${id()}, 'PARTNER', ${owner}, ${key()}, 'Libreville', NULL, ${desc}, 'PENDING', NULL, NULL, NULL`,
      ),
    ).rejects.toThrow();
    await expect(
      insert(
        `${id()}, 'PARTNER', ${owner}, ${key()}, 'Libreville', '+33612345678', ${desc}, 'PENDING', NULL, NULL, NULL`,
      ),
    ).rejects.toThrow();
    // Refus sans motif ; validation par le propriétaire lui-même
    await expect(
      insert(
        `${id()}, 'PARTNER', ${owner}, ${key()}, 'Libreville', '+241066123456', ${desc}, 'REJECTED', NULL, NULL, NULL`,
      ),
    ).rejects.toThrow();
    await expect(
      insert(
        `${id()}, 'PARTNER', ${owner}, ${key()}, 'Libreville', '+241066123456', ${desc}, 'ACTIVE', NULL, ${owner}, now()`,
      ),
    ).rejects.toThrow();
    expect(await prisma.shop.count({ where: { ownerAccountId: client.accountId } })).toBe(0);
  });

  it("S7.5-T07 : « Ma boutique », page publique et annuaire (quartier d'abord), sans téléphone", async () => {
    const patch = (body: object, token = client.token) =>
      request(app.getHttpServer())
        .patch("/api/v1/vendors/shop")
        .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
        .set("Authorization", `Bearer ${token}`)
        .send(body);
    const pub = (url: string) =>
      request(app.getHttpServer()).get(url).set("X-Kemdia-Internal-Key", INTERNAL_KEY);

    const shop = matches(
      ShopSchema,
      (await apply({ ...application(), neighborhood: "Akébé" }).expect(201)).body,
    );
    expect(shop).toMatchObject({ city: "Libreville", neighborhood: "Akébé" });
    // En attente : pas de page publique
    await pub(`/api/v1/shops/${shop.slug}`).expect(404);
    await decide(shop.id, "approve").expect(200);

    const page = await pub(`/api/v1/shops/${shop.slug}`).expect(200);
    const visible = matches(PublicShopSchema, page.body);
    expect(visible).toMatchObject({
      name: shop.name,
      neighborhood: "Akébé",
      official: false,
      productCount: 0,
    });
    // Ni téléphone, ni propriétaire, ni identifiant interne
    expect(JSON.stringify(page.body)).not.toMatch(/phone|owner|"id"|\+241/);

    // Le vendeur change de quartier : la page publique suit, le journal le garde
    const updated = matches(
      ShopSchema,
      (
        await patch({
          city: "Libreville",
          neighborhood: "Glass",
          description: "Pagnes, robes et chemises cousus sur commande à Glass.",
        }).expect(200)
      ).body,
    );
    expect(updated).toMatchObject({ name: shop.name, neighborhood: "Glass" });
    expect(
      matches(PublicShopSchema, (await pub(`/api/v1/shops/${shop.slug}`).expect(200)).body)
        .neighborhood,
    ).toBe("Glass");
    expect((await auditOf(shop.id)).map((e) => e.action)).toContain("shop.profile_updated");
    // Ville hors liste, nom non modifiable, quartier hors liste
    await patch({ city: "Atlantis", description: "Pagnes, robes et chemises cousus." }).expect(422);
    await patch({
      city: "Libreville",
      name: "Autre",
      description: "Pagnes, robes et chemises.",
    }).expect(400);
    await patch({
      city: "Oyem",
      neighborhood: "Glass",
      description: "Pagnes, robes et chemises.",
    }).expect(422);

    // Annuaire : boutique officielle d'abord, puis celles du quartier du client
    const list = matches(
      PublicShopPageSchema,
      (await pub("/api/v1/shops?ville=Libreville&quartier=Glass").expect(200)).body,
    );
    expect(list.items[0]).toMatchObject({ slug: "kemdia", official: true });
    expect(list.items[0]!.productCount).toBeGreaterThan(0);
    expect(list.items[1]?.slug).toBe(shop.slug);
    expect(list.items.every((s) => s.city === "Libreville")).toBe(true);

    // Produits d'une boutique : prix et stock de SON offre
    const kemdiaProducts = matches(
      ProductPageSchema,
      (await pub("/api/v1/products?shop=kemdia&pageSize=5").expect(200)).body,
    );
    expect(kemdiaProducts.total).toBe(list.items[0]!.productCount);

    // Suspendue : plus de page publique, plus de produits listés
    await decide(shop.id, "suspend", "Articles contrefaits signalés").expect(200);
    await pub(`/api/v1/shops/${shop.slug}`).expect(404);
    expect(
      matches(ProductPageSchema, (await pub(`/api/v1/products?shop=${shop.slug}`).expect(200)).body)
        .total,
    ).toBe(0);
    const after = matches(
      PublicShopPageSchema,
      (await pub("/api/v1/shops?ville=Libreville").expect(200)).body,
    );
    expect(after.items.map((s) => s.slug)).not.toContain(shop.slug);
  });
});
