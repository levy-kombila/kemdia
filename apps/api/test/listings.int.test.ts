import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  AdminListingDetailSchema,
  AdminListingSchema,
  AvailabilityResponseSchema,
  ListingCorrectionPageSchema,
  ListingCorrectionSchema,
  ListingMergeResultSchema,
  ModerationProductSchema,
  ProblemDetailsSchema,
  ProductDetailSchema,
  ProductPageSchema,
  ShopSchema,
  VendorListingPageSchema,
  VendorListingSchema,
  VendorProductSchema,
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
import { confirmSecondFactor } from "./second-factor-helper.js";

/**
 * Fiche commune et offres des boutiques sur une VRAIE base (S7.5-T02, ADR-0049), par HTTP : une boutique vend un
 * produit qu'une autre a fait valider (offre en ligne tout de suite), le site montre UNE fiche et toutes ses offres,
 * l'offre mise en avant, le contenu verrouillé après publication, les corrections, retraits et fusions de l'équipe,
 * et les règles tenues par la base (contenu recopié, compteurs).
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;

type Session = { token: string; accountId: string };
type Vendor = { session: Session; shopId: string; city: string };

describe("Fiches communes et offres (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Session;
  let moderator: Session;
  let categoryId = "";

  const call = (
    method: "get" | "post" | "put" | "patch" | "delete",
    url: string,
    token?: string,
  ) => {
    const server = request(app.getHttpServer());
    const req = server[method](url).set("X-Kemdia-Internal-Key", INTERNAL_KEY);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  async function openSession(role?: "ADMIN" | "CATALOG"): Promise<Session> {
    const email = `fiches.${randomUUID()}@exemple.ga`;
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

  async function openVendor(city = "Libreville"): Promise<Vendor> {
    const session = await openSession();
    const shop = matches(
      ShopSchema,
      (
        await call("post", "/api/v1/vendors/shop", session.token)
          .send({
            name: `Boutique ${randomBytes(4).toString("hex")}`,
            city,
            phone: "066 12 34 56",
            description: "Téléphones et accessoires, neufs et garantis.",
          })
          .expect(201)
      ).body,
    );
    await call("post", `/api/v1/admin/shops/${shop.id}/approve`, admin.token).send({}).expect(200);
    return { session, shopId: shop.id, city };
  }

  /** Fiche créée par `owner` et validée par la modération : en ligne, avec son offre. */
  async function publishedListing(
    owner: Vendor,
    title = `Smartphone ${randomBytes(3).toString("hex")}`,
  ) {
    const product = matches(
      VendorProductSchema,
      (
        await call("post", "/api/v1/vendors/products", owner.session.token)
          .send({
            title,
            description: "Smartphone neuf, double SIM, garanti un an, chargeur fourni.",
            brand: "Kemphone",
            categoryId,
            variants: [
              { name: "Noir 128 Go", attributes: { couleur: "Noir" }, price: 300_000, stock: 2 },
              { name: "Bleu 256 Go", attributes: { couleur: "Bleu" }, price: 350_000, stock: 1 },
            ],
          })
          .expect(201)
      ).body,
    );
    const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    await call("post", `/api/v1/moderation/products/${product.id}/approve`, moderator.token)
      .send({ submittedAt: row.submittedAt!.toISOString() })
      .expect(200);
    return product;
  }

  const offer = async (
    vendor: Vendor,
    listingId: string,
    lines: { listingVariantId: string; price: number; stock: number }[],
    status = 201,
  ) => {
    const res = await call(
      "post",
      `/api/v1/vendors/listings/${listingId}/offer`,
      vendor.session.token,
    ).send({ variants: lines });
    expect(res.status).toBe(status);
    return res;
  };
  const detail = async (slug: string, query = "") =>
    matches(
      ProductDetailSchema,
      (await call("get", `/api/v1/products/${slug}${query}`).expect(200)).body,
    );

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
      'TRUNCATE "catalog"."product_variants", "catalog"."products", "catalog"."listing_variants", "catalog"."listings", "catalog"."categories" CASCADE',
    );
    await importCatalog(prepareDemoCatalog(demoCatalog), {
      categories: new PrismaCategoryRepository(prisma),
      products: new PrismaProductRepository(prisma),
    });
    categoryId = (await prisma.category.findFirstOrThrow({ orderBy: { slug: "asc" } })).id;
  });

  beforeEach(async () => {
    admin = await openSession("ADMIN");
    moderator = await openSession("CATALOG");
  });

  afterAll(async () => {
    await app.close();
  });

  it("catalogue importé : chaque produit est une offre sur SA fiche (même identifiant, même adresse)", async () => {
    const offers = await prisma.product.findMany({ include: { listing: true } });
    expect(offers.length).toBeGreaterThan(10);
    for (const o of offers) {
      expect(o.listingId).toBe(o.id);
      expect(o.listing.slug).toBe(o.slug);
      expect(o.title).toBe(o.listing.title);
    }
    const published = offers.filter((o) => o.status === "PUBLISHED" && !o.shopSuspended);
    for (const o of published) expect(o.listing.offerCount).toBe(1);
  });

  it("une 2e boutique vend le même produit : en ligne tout de suite, UNE fiche, deux offres", async () => {
    const owner = await openVendor("Libreville");
    const other = await openVendor("Port-Gentil");
    const product = await publishedListing(owner);
    const [noir, bleu] = product.variants;

    // La 2e boutique trouve la fiche avant de créer un doublon
    const found = matches(
      VendorListingPageSchema,
      (
        await call(
          "get",
          `/api/v1/vendors/listings?q=${encodeURIComponent(product.title)}`,
          other.session.token,
        ).expect(200)
      ).body,
    );
    expect(found.items.map((l) => l.id)).toContain(product.listing.id);
    expect(found.items.find((l) => l.id === product.listing.id)?.myOfferId).toBeNull();

    const created = matches(
      VendorProductSchema,
      (
        await offer(other, product.listing.id, [
          { listingVariantId: noir!.listingVariantId, price: 280_000, stock: 3 },
        ])
      ).body,
    );
    expect(created).toMatchObject({
      status: "published",
      visible: true,
      title: product.title,
      listing: { id: product.listing.id, slug: product.listing.slug, editable: false },
    });
    expect(created.variants).toEqual([
      expect.objectContaining({ name: "Noir 128 Go", listingVariantId: noir!.listingVariantId }),
    ]);
    const trace = await prisma.auditEvent.findFirst({
      where: { targetId: created.id, action: "offer.created" },
    });
    expect(trace?.details).toMatchObject({ listing: product.listing.id, lines: 1 });

    // Une seule fiche publique, deux offres ; la moins chère en stock est mise en avant
    const page = await detail(product.listing.slug);
    expect(page.offerCount).toBe(2);
    expect(page.variantId).toBe(created.variants[0]!.id);
    expect(page.offers[0]).toMatchObject({ isMain: true, seller: { city: "Port-Gentil" } });
    expect(page.offers.map((o) => o.offerId).sort()).toEqual([created.id, product.id].sort());
    expect(page.variants.map((v) => v.name)).toEqual(["Noir 128 Go", "Bleu 256 Go"]);
    expect(page.variants[1]?.id).toBe(bleu!.id);
    const search = matches(
      ProductPageSchema,
      (await call("get", `/api/v1/products?q=${encodeURIComponent(product.title)}`).expect(200))
        .body,
    );
    expect(search.items.filter((i) => i.id === product.listing.id)).toEqual([
      expect.objectContaining({
        offerCount: 2,
        price: 280_000,
        variantId: created.variants[0]!.id,
      }),
    ]);
    // Le panier accepte les deux offres : 2 exemplaires chez deux boutiques
    const ok = matches(
      AvailabilityResponseSchema,
      (
        await call("post", "/api/v1/availability")
          .send({
            lines: [
              { variantId: created.variants[0]!.id, quantity: 1 },
              { variantId: noir!.id, quantity: 1 },
            ],
          })
          .expect(200)
      ).body,
    );
    expect(ok.ok).toBe(true);

    // Une seule offre par boutique ; fiche inconnue ; déclinaison d'une autre fiche
    expect(
      codeOf(
        (
          await offer(
            other,
            product.listing.id,
            [{ listingVariantId: noir!.listingVariantId, price: 1_000, stock: 1 }],
            409,
          )
        ).body,
      ),
    ).toBe("DEJA_EN_VENTE");
    expect(
      codeOf(
        (
          await offer(
            other,
            randomUUID(),
            [{ listingVariantId: randomUUID(), price: 1_000, stock: 1 }],
            404,
          )
        ).body,
      ),
    ).toBe("FICHE_INTROUVABLE");
    const third = await openVendor();
    expect(
      codeOf(
        (
          await offer(
            third,
            product.listing.id,
            [{ listingVariantId: randomUUID(), price: 1_000, stock: 1 }],
            422,
          )
        ).body,
      ),
    ).toBe("DECLINAISON_INTROUVABLE");

    // Nouvelle déclinaison de la fiche dans l'offre existante
    const grown = matches(
      VendorProductSchema,
      (
        await call("post", `/api/v1/vendors/products/${created.id}/variants`, other.session.token)
          .send({ listingVariantId: bleu!.listingVariantId, price: 340_000, stock: 1 })
          .expect(201)
      ).body,
    );
    expect(grown.variants.map((v) => v.name)).toEqual(["Noir 128 Go", "Bleu 256 Go"]);
  });

  it("à prix égal, la boutique de la ville du client est mise en avant", async () => {
    const owner = await openVendor("Libreville");
    const other = await openVendor("Franceville");
    const product = await publishedListing(owner);
    const noir = product.variants[0]!;
    await offer(other, product.listing.id, [
      { listingVariantId: noir.listingVariantId, price: noir.price, stock: 5 },
    ]);
    expect((await detail(product.listing.slug, "?ville=Franceville")).offers[0]?.seller?.city).toBe(
      "Franceville",
    );
    expect((await detail(product.listing.slug, "?ville=libreville")).offers[0]?.seller?.city).toBe(
      "Libreville",
    );
  });

  it("fiche pas encore en ligne : personne d'autre n'y vend ; contenu verrouillé après publication", async () => {
    const owner = await openVendor();
    const other = await openVendor();
    const pending = matches(
      VendorProductSchema,
      (
        await call("post", "/api/v1/vendors/products", owner.session.token)
          .send({
            title: `Montre ${randomBytes(3).toString("hex")}`,
            description: "Montre connectée étanche, autonomie de dix jours, bracelet souple.",
            categoryId,
            variants: [{ name: "Noire", price: 40_000, stock: 3 }],
          })
          .expect(201)
      ).body,
    );
    expect(pending.listing).toMatchObject({ status: "pending", editable: true });
    expect(
      codeOf(
        (
          await offer(
            other,
            pending.listing.id,
            [{ listingVariantId: pending.variants[0]!.listingVariantId, price: 1_000, stock: 1 }],
            409,
          )
        ).body,
      ),
    ).toBe("FICHE_NON_PUBLIEE");

    const product = await publishedListing(owner);
    const created = matches(
      VendorProductSchema,
      (
        await offer(other, product.listing.id, [
          { listingVariantId: product.variants[0]!.listingVariantId, price: 290_000, stock: 1 },
        ])
      ).body,
    );
    for (const [token, id] of [
      [owner.session.token, product.id],
      [other.session.token, created.id],
    ] as const) {
      const res = await call("put", `/api/v1/vendors/products/${id}`, token)
        .send({ title: "Titre jamais modéré", description: "x".repeat(40), categoryId })
        .expect(409);
      expect(codeOf(res.body)).toBe("FICHE_PUBLIEE");
    }
  });

  it("l'équipe corrige la fiche : recopiée sur toutes les offres, tracée", async () => {
    const owner = await openVendor();
    const other = await openVendor();
    const product = await publishedListing(owner);
    const created = matches(
      VendorProductSchema,
      (
        await offer(other, product.listing.id, [
          { listingVariantId: product.variants[0]!.listingVariantId, price: 290_000, stock: 1 },
        ])
      ).body,
    );
    const edited = matches(
      AdminListingSchema,
      (
        await call("patch", `/api/v1/moderation/listings/${product.listing.id}`, moderator.token)
          .send({
            title: "Smartphone Kemphone X",
            variants: [
              { id: product.variants[0]!.listingVariantId, name: "Noir · 128 Go" },
              { name: "Vert · 256 Go", attributes: { couleur: "Vert" } },
            ],
          })
          .expect(200)
      ).body,
    );
    expect(edited.title).toBe("Smartphone Kemphone X");
    expect(edited.variants.map((v) => v.name)).toEqual([
      "Noir · 128 Go",
      "Bleu 256 Go",
      "Vert · 256 Go",
    ]);
    for (const [token, id] of [
      [owner.session.token, product.id],
      [other.session.token, created.id],
    ] as const) {
      const mine = matches(
        VendorProductSchema,
        (await call("get", `/api/v1/vendors/products/${id}`, token).expect(200)).body,
      );
      expect(mine.title).toBe("Smartphone Kemphone X");
      expect(mine.variants[0]?.name).toBe("Noir · 128 Go");
    }
    expect((await detail(product.listing.slug)).title).toBe("Smartphone Kemphone X");
    expect(
      await prisma.auditEvent.count({
        where: { targetId: product.listing.id, action: "listing.updated" },
      }),
    ).toBe(1);
    // Un vendeur ou un client n'y a pas accès
    await call("patch", `/api/v1/moderation/listings/${product.listing.id}`, other.session.token)
      .send({ title: "Piraté" })
      .expect(403);
    const full = matches(
      AdminListingDetailSchema,
      (
        await call(
          "get",
          `/api/v1/moderation/listings/${product.listing.id}`,
          moderator.token,
        ).expect(200)
      ).body,
    );
    expect(full.offers.map((o) => o.id).sort()).toEqual([product.id, created.id].sort());
  });

  it("retrait d'une offre par l'équipe : cachée, motif au vendeur ; pas de retour sans modération", async () => {
    const owner = await openVendor();
    const other = await openVendor();
    const product = await publishedListing(owner);
    const created = matches(
      VendorProductSchema,
      (
        await offer(other, product.listing.id, [
          { listingVariantId: product.variants[0]!.listingVariantId, price: 10_000, stock: 9 },
        ])
      ).body,
    );
    const withdrawn = matches(
      ModerationProductSchema,
      (
        await call("post", `/api/v1/moderation/offers/${created.id}/withdraw`, moderator.token)
          .send({ reason: "Prix anormalement bas : contrefaçon probable" })
          .expect(200)
      ).body,
    );
    expect(withdrawn).toMatchObject({ status: "rejected", visible: false });
    expect((await detail(product.listing.slug)).offerCount).toBe(1);
    // Ni archivage (pour revenir sans modération), ni remise en ligne directe
    const archive = await call(
      "post",
      `/api/v1/vendors/products/${created.id}/archive`,
      other.session.token,
    ).expect(409);
    expect(codeOf(archive.body)).toBe("STATUT_PRODUIT_INCOMPATIBLE");
    const back = matches(
      VendorProductSchema,
      (
        await call(
          "post",
          `/api/v1/vendors/products/${created.id}/restore`,
          other.session.token,
        ).expect(200)
      ).body,
    );
    expect(back.status).toBe("pending");
    // Relecture S7.5-T02 (faille critique) : en attente, elle ne s'archive pas pour revenir en ligne sans modération
    const sneaky = await call(
      "post",
      `/api/v1/vendors/products/${created.id}/archive`,
      other.session.token,
    ).expect(409);
    expect(codeOf(sneaky.body)).toBe("STATUT_PRODUIT_INCOMPATIBLE");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "PENDING",
    );
    // Offre archivée par son vendeur : revient en ligne tout de suite
    await call(
      "post",
      `/api/v1/vendors/products/${product.id}/archive`,
      owner.session.token,
    ).expect(200);
    const restored = matches(
      VendorProductSchema,
      (
        await call(
          "post",
          `/api/v1/vendors/products/${product.id}/restore`,
          owner.session.token,
        ).expect(200)
      ).body,
    );
    expect(restored).toMatchObject({ status: "published", visible: true });
    expect(
      await prisma.auditEvent.count({ where: { targetId: product.id, action: "offer.restored" } }),
    ).toBe(1);
  });

  it("la fiche reste en ligne quand la boutique qui l'a créée arrête de vendre", async () => {
    const owner = await openVendor();
    const other = await openVendor();
    const product = await publishedListing(owner);
    await offer(other, product.listing.id, [
      { listingVariantId: product.variants[0]!.listingVariantId, price: 290_000, stock: 1 },
    ]);
    await call(
      "post",
      `/api/v1/vendors/products/${product.id}/archive`,
      owner.session.token,
    ).expect(200);
    const page = await detail(product.listing.slug);
    expect(page.offerCount).toBe(1);
    expect(page.title).toBe(product.title);
  });

  it("fusion d'un doublon : ses offres passent sur la fiche cible, son adresse y mène", async () => {
    const owner = await openVendor();
    const dup = await openVendor();
    const target = await publishedListing(owner, `Tablette ${randomBytes(3).toString("hex")}`);
    const source = await publishedListing(dup, `Tablete ${randomBytes(3).toString("hex")}`);
    const map = {
      [source.variants[0]!.listingVariantId]: target.variants[0]!.listingVariantId,
      [source.variants[1]!.listingVariantId]: target.variants[1]!.listingVariantId,
    };
    // Incomplète : refusée
    const partial = await call(
      "post",
      `/api/v1/moderation/listings/${source.listing.id}/merge`,
      moderator.token,
    )
      .send({
        into: target.listing.id,
        variants: { [source.variants[0]!.listingVariantId]: target.variants[0]!.listingVariantId },
      })
      .expect(409);
    expect(codeOf(partial.body)).toBe("FUSION_IMPOSSIBLE");

    const merged = matches(
      ListingMergeResultSchema,
      (
        await call(
          "post",
          `/api/v1/moderation/listings/${source.listing.id}/merge`,
          moderator.token,
        )
          .send({ into: target.listing.id, variants: map })
          .expect(200)
      ).body,
    );
    expect(merged).toMatchObject({ moved: 1, listing: { id: target.listing.id, offerCount: 2 } });
    // L'ancienne adresse mène à la cible ; le doublon disparaît des listes
    const page = await detail(source.listing.slug);
    expect(page).toMatchObject({ id: target.listing.id, slug: target.listing.slug, offerCount: 2 });
    const moved = matches(
      VendorProductSchema,
      (await call("get", `/api/v1/vendors/products/${source.id}`, dup.session.token).expect(200))
        .body,
    );
    expect(moved).toMatchObject({ title: target.title, listing: { id: target.listing.id } });
    // Les variantes vendues (paniers, commandes) n'ont pas changé d'identifiant
    expect(moved.variants.map((v) => v.id)).toEqual(source.variants.map((v) => v.id));
    const ok = matches(
      AvailabilityResponseSchema,
      (
        await call("post", "/api/v1/availability")
          .send({ lines: [{ variantId: source.variants[0]!.id, quantity: 1 }] })
          .expect(200)
      ).body,
    );
    expect(ok.ok).toBe(true);
    // Une boutique qui vend sur les deux fiches bloque la fusion
    const third = await publishedListing(owner, `Liseuse ${randomBytes(3).toString("hex")}`);
    await offer(dup, third.listing.id, [
      { listingVariantId: third.variants[0]!.listingVariantId, price: 1_000, stock: 1 },
    ]);
    const blocked = await call(
      "post",
      `/api/v1/moderation/listings/${third.listing.id}/merge`,
      moderator.token,
    )
      .send({ into: target.listing.id, variants: {} })
      .expect(409);
    expect(codeOf(blocked.body)).toBe("FUSION_IMPOSSIBLE");
    expect(
      await prisma.auditEvent.count({
        where: { targetId: source.listing.id, action: "listing.merged" },
      }),
    ).toBe(1);
  });

  it("fusion : une offre déplacée qui n'était pas en ligne repasse par la modération (relecture S7.5-T02)", async () => {
    const owner = await openVendor();
    const dup = await openVendor();
    const target = await publishedListing(owner, `Casque ${randomBytes(3).toString("hex")}`);
    // Doublon jamais validé : refusé puis archivé par son vendeur
    const pending = matches(
      VendorProductSchema,
      (
        await call("post", "/api/v1/vendors/products", dup.session.token)
          .send({
            title: `Kasque ${randomBytes(3).toString("hex")}`,
            description: "Casque sans fil, réduction de bruit, autonomie trente heures.",
            categoryId,
            variants: [{ name: "Noir", price: 50_000, stock: 2 }],
          })
          .expect(201)
      ).body,
    );
    const row = await prisma.product.findUniqueOrThrow({ where: { id: pending.id } });
    await call("post", `/api/v1/moderation/products/${pending.id}/reject`, moderator.token)
      .send({ reason: "Photos manquantes", submittedAt: row.submittedAt!.toISOString() })
      .expect(200);
    await call("post", `/api/v1/vendors/products/${pending.id}/archive`, dup.session.token).expect(
      200,
    );
    await call("post", `/api/v1/moderation/listings/${pending.listing.id}/merge`, moderator.token)
      .send({
        into: target.listing.id,
        variants: { [pending.variants[0]!.listingVariantId]: target.variants[0]!.listingVariantId },
      })
      .expect(200);
    const moved = await prisma.product.findUniqueOrThrow({ where: { id: pending.id } });
    expect(moved).toMatchObject({ status: "REJECTED", listingId: target.listing.id });
    const back = matches(
      VendorProductSchema,
      (
        await call(
          "post",
          `/api/v1/vendors/products/${pending.id}/restore`,
          dup.session.token,
        ).expect(200)
      ).body,
    );
    expect(back.status).toBe("pending");
  });

  it("un modérateur qui vend sur une fiche ne la corrige ni ne la fusionne (relecture S7.5-T02)", async () => {
    const owner = await openVendor();
    const target = await publishedListing(owner);
    // Le modérateur ouvre sa propre boutique et vend sur la fiche cible
    const staffShop = matches(
      ShopSchema,
      (
        await call("post", "/api/v1/vendors/shop", moderator.token)
          .send({
            name: `Boutique ${randomBytes(4).toString("hex")}`,
            city: "Libreville",
            phone: "066 12 34 57",
            description: "Boutique d'un membre de l'équipe, pour le test.",
          })
          .expect(201)
      ).body,
    );
    await call("post", `/api/v1/admin/shops/${staffShop.id}/approve`, admin.token)
      .send({})
      .expect(200);
    await offer(
      { session: moderator, shopId: staffShop.id, city: "Libreville" },
      target.listing.id,
      [{ listingVariantId: target.variants[0]!.listingVariantId, price: 1_000, stock: 1 }],
    );
    const other = await openVendor();
    const source = await publishedListing(other);
    for (const res of [
      await call("patch", `/api/v1/moderation/listings/${target.listing.id}`, moderator.token)
        .send({ title: "Titre à mon avantage" })
        .expect(403),
      await call("post", `/api/v1/moderation/listings/${source.listing.id}/merge`, moderator.token)
        .send({
          into: target.listing.id,
          variants: {
            [source.variants[0]!.listingVariantId]: target.variants[0]!.listingVariantId,
            [source.variants[1]!.listingVariantId]: target.variants[1]!.listingVariantId,
          },
        })
        .expect(403),
    ])
      expect(codeOf(res.body)).toBe("PRODUIT_SUR_SOI_INTERDIT");
  });

  it("propositions de correction : le vendeur écrit, l'équipe lit et clôt ; tracé (S7.5-T03)", async () => {
    const owner = await openVendor();
    const seller = await openVendor("Oyem");
    const product = await publishedListing(owner);
    const mine = (
      await offer(seller, product.listing.id, [
        { listingVariantId: product.variants[0]!.listingVariantId, price: 290_000, stock: 1 },
      ])
    ).body as VendorProduct;
    // Page « Vendre ce produit » : la fiche, et l'offre de la boutique quand elle existe
    const page = matches(
      VendorListingSchema,
      (
        await call(
          "get",
          `/api/v1/vendors/listings/${product.listing.id}`,
          seller.session.token,
        ).expect(200)
      ).body,
    );
    expect(page.myOfferId).toBe(mine.id);
    expect(matches(VendorProductSchema, mine).listing.variants).toHaveLength(2);

    const url = `/api/v1/vendors/products/${mine.id}/corrections`;
    const sent = matches(
      ListingCorrectionSchema,
      (
        await call("post", url, seller.session.token)
          .send({ message: "  La batterie fait 5 000 mAh, pas 4 000.  " })
          .expect(201)
      ).body,
    );
    expect(sent).toMatchObject({
      listing: { id: product.listing.id },
      message: "La batterie fait 5 000 mAh, pas 4 000.",
      closedAt: null,
    });
    // Trop court ; offre d'une autre boutique ; sans rôle vendeur
    expect(
      codeOf(
        (await call("post", url, seller.session.token).send({ message: "court" }).expect(422)).body,
      ),
    ).toBe("PRODUIT_INVALIDE");
    // Relecture : 5 émojis = 5 caractères (pas 10) → refus propre, jamais une erreur 500
    expect(
      codeOf(
        (await call("post", url, seller.session.token).send({ message: "😀😀😀😀😀" }).expect(422))
          .body,
      ),
    ).toBe("PRODUIT_INVALIDE");
    await call("post", url, owner.session.token)
      .send({ message: "Je corrige l'offre d'un autre vendeur." })
      .expect(404);
    await call("post", url, moderator.token)
      .send({ message: "Je ne suis pas vendeur du tout." })
      .expect(403);

    // L'équipe : la file des propositions ouvertes, filtrée par fiche
    const open = matches(
      ListingCorrectionPageSchema,
      (
        await call(
          "get",
          `/api/v1/moderation/listing-corrections?listingId=${product.listing.id}`,
          moderator.token,
        ).expect(200)
      ).body,
    );
    expect(open.items.map((c) => c.id)).toEqual([sent.id]);
    expect(open.items[0]!.shop?.id).toBe(seller.shopId);
    await call("get", "/api/v1/moderation/listing-corrections", seller.session.token).expect(403);

    const closeUrl = `/api/v1/moderation/listing-corrections/${sent.id}/close`;
    const closed = matches(
      ListingCorrectionSchema,
      (await call("post", closeUrl, moderator.token).send({ note: "Corrigé, merci." }).expect(200))
        .body,
    );
    expect(closed).toMatchObject({ note: "Corrigé, merci." });
    expect(closed.closedAt).not.toBeNull();
    expect(codeOf((await call("post", closeUrl, moderator.token).send({}).expect(409)).body)).toBe(
      "STATUT_PRODUIT_INCOMPATIBLE",
    );
    expect(
      codeOf(
        (
          await call(
            "post",
            `/api/v1/moderation/listing-corrections/${randomUUID()}/close`,
            moderator.token,
          )
            .send({})
            .expect(404)
        ).body,
      ),
    ).toBe("CORRECTION_INTROUVABLE");
    const closedPage = matches(
      ListingCorrectionPageSchema,
      (
        await call(
          "get",
          `/api/v1/moderation/listing-corrections?status=closed&listingId=${product.listing.id}`,
          moderator.token,
        ).expect(200)
      ).body,
    );
    expect(closedPage.items.map((c) => c.id)).toEqual([sent.id]);

    const audit = await prisma.auditEvent.findMany({
      where: { targetId: product.listing.id, action: { startsWith: "listing.correction" } },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual([
      "listing.correction_proposed",
      "listing.correction_closed",
    ]);
  });

  it("propositions : 10 ouvertes au plus par boutique, même envoyées en même temps ; fiche pas en ligne refusée", async () => {
    const owner = await openVendor();
    const product = await publishedListing(owner);
    const url = `/api/v1/vendors/products/${product.id}/corrections`;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        call("post", url, owner.session.token).send({ message: `Proposition numéro ${i + 1}.` }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    for (const r of results.filter((r) => r.status !== 201)) {
      expect(r.status).toBe(409);
      expect(codeOf(r.body)).toBe("TROP_DE_CORRECTIONS");
    }
    // Sur sa fiche pas encore en ligne, le vendeur la modifie lui-même
    const draft = matches(
      VendorProductSchema,
      (
        await call("post", "/api/v1/vendors/products", owner.session.token)
          .send({
            title: `Tablette ${randomBytes(3).toString("hex")}`,
            description: "Tablette neuve, écran 10 pouces, garantie un an.",
            categoryId,
            variants: [{ name: "Gris", attributes: {}, price: 150_000, stock: 1 }],
          })
          .expect(201)
      ).body,
    );
    expect(
      codeOf(
        (
          await call(
            "post",
            `/api/v1/vendors/products/${draft.id}/corrections`,
            owner.session.token,
          )
            .send({ message: "Une proposition sur ma propre fiche." })
            .expect(409)
        ).body,
      ),
    ).toBe("STATUT_PRODUIT_INCOMPATIBLE");
  });

  it("propositions (relecture S7.5-T03) : offre retirée refusée ; pas de clôture sur une fiche où l'on vend ; suivent une fusion", async () => {
    const owner = await openVendor();
    const seller = await openVendor();
    const product = await publishedListing(owner);
    const mine = (
      await offer(seller, product.listing.id, [
        { listingVariantId: product.variants[0]!.listingVariantId, price: 280_000, stock: 1 },
      ])
    ).body as VendorProduct;
    const propose = (id: string, token: string) =>
      call("post", `/api/v1/vendors/products/${id}/corrections`, token).send({
        message: "Le poids indiqué est faux : 180 g.",
      });
    const sent = matches(
      ListingCorrectionSchema,
      (await propose(mine.id, seller.session.token).expect(201)).body,
    );

    // Le modérateur vend sur la fiche : il ne clôt pas la proposition d'un concurrent
    const staffShop = matches(
      ShopSchema,
      (
        await call("post", "/api/v1/vendors/shop", moderator.token)
          .send({
            name: `Boutique ${randomBytes(4).toString("hex")}`,
            city: "Libreville",
            phone: "066 12 34 58",
            description: "Boutique d'un membre de l'équipe, pour le test.",
          })
          .expect(201)
      ).body,
    );
    await call("post", `/api/v1/admin/shops/${staffShop.id}/approve`, admin.token)
      .send({})
      .expect(200);
    await offer(
      { session: moderator, shopId: staffShop.id, city: "Libreville" },
      product.listing.id,
      [{ listingVariantId: product.variants[0]!.listingVariantId, price: 1_000, stock: 1 }],
    );
    expect(
      codeOf(
        (
          await call(
            "post",
            `/api/v1/moderation/listing-corrections/${sent.id}/close`,
            moderator.token,
          )
            .send({ note: "Sans suite." })
            .expect(403)
        ).body,
      ),
    ).toBe("PRODUIT_SUR_SOI_INTERDIT");

    // Offre retirée par l'équipe : la boutique ne propose plus rien sur cette fiche
    const other = await openSession("CATALOG");
    await call("post", `/api/v1/moderation/offers/${mine.id}/withdraw`, other.token)
      .send({ reason: "Contrefaçon signalée" })
      .expect(200);
    expect(codeOf((await propose(mine.id, seller.session.token).expect(409)).body)).toBe(
      "STATUT_PRODUIT_INCOMPATIBLE",
    );

    // Fusion du doublon : la proposition ouverte suit ses offres sur la fiche cible
    const dup = await publishedListing(owner);
    const dupOffer = (
      await offer(seller, dup.listing.id, [
        { listingVariantId: dup.variants[0]!.listingVariantId, price: 200_000, stock: 1 },
      ])
    ).body as VendorProduct;
    const onDup = matches(
      ListingCorrectionSchema,
      (await propose(dupOffer.id, seller.session.token).expect(201)).body,
    );
    const target = await publishedListing(await openVendor());
    await call("post", `/api/v1/moderation/listings/${dup.listing.id}/merge`, other.token)
      .send({
        into: target.listing.id,
        variants: {
          [dup.variants[0]!.listingVariantId]: target.variants[0]!.listingVariantId,
          [dup.variants[1]!.listingVariantId]: target.variants[1]!.listingVariantId,
        },
      })
      .expect(200);
    expect(
      (await prisma.listingCorrection.findUniqueOrThrow({ where: { id: onDup.id } })).listingId,
    ).toBe(target.listing.id);
  });

  it("la base garde le contenu de la fiche sur les offres et les compteurs à jour, même sans le code", async () => {
    const owner = await openVendor();
    const product: VendorProduct = await publishedListing(owner);
    await prisma.$executeRaw`UPDATE "catalog"."products" SET "title" = 'Écrit à la main' WHERE "id" = ${product.id}::uuid`;
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).title).toBe(
      product.title,
    );
    await prisma.$executeRaw`UPDATE "catalog"."products" SET "status" = 'ARCHIVED' WHERE "id" = ${product.id}::uuid`;
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: product.listing.id } })).offerCount,
    ).toBe(0);
    await call("get", `/api/v1/products/${product.listing.slug}`).expect(404);
    // Une variante ne peut pas désigner la déclinaison d'une autre fiche
    const other = await publishedListing(owner);
    await expect(
      prisma.$executeRaw`UPDATE "catalog"."product_variants" SET "listing_variant_id" = ${other.variants[0]!.listingVariantId}::uuid WHERE "id" = ${product.variants[0]!.id}::uuid`,
    ).rejects.toThrow();
  });
});
