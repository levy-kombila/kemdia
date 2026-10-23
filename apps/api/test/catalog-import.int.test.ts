import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import { CatalogImportReportSchema, KEMDIA_SHOP_ID, ProblemDetailsSchema } from "@kemdia/contracts";
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

const INTERNAL_KEY = randomBytes(32).toString("base64url");
const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;
const HEAD = "boutique;reference;titre;description;marque;categorie;variante;prix;prix_barre;stock";
const DESC = "Pagne wax 100 % coton, 6 yards, motifs garantis grand teint, lavable en machine.";

/** Import du vrai catalogue (S8-T03, ADR-0058) sur une vraie base. */
describe("Import du catalogue (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let category = "";
  let catalogToken = "";

  const post = (url: string, token: string, csv: string, type = "text/csv") =>
    request(app.getHttpServer())
      .post(url)
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", type)
      .send(csv);

  async function openSession(role?: "CATALOG" | "SUPPORT"): Promise<string> {
    const email = `import.${randomUUID()}@exemple.ga`;
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
    return opened.token;
  }

  /** Boutique d'un vendeur partenaire, active (ou suspendue). */
  async function partnerShop(status: "ACTIVE" | "SUSPENDED" = "ACTIVE"): Promise<string> {
    const owner = randomUUID();
    const email = `vendeur.${owner}@exemple.ga`;
    const account = Account.register({
      id: owner,
      firstName: "Awa",
      lastName: "Ndong",
      identifier: requireIdentifier(email),
      passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c2Vs$aGFjaGFnZQ",
      now: new Date(),
    });
    await new PrismaAccountRepository(prisma).save(account);
    const suffix = owner.slice(0, 8);
    const slug = `wax-awa-${suffix}`;
    await prisma.shop.create({
      data: {
        id: randomUUID(),
        kind: "PARTNER",
        ownerAccountId: owner,
        name: `Wax Awa ${suffix}`,
        nameKey: `wax awa ${suffix}`,
        slug,
        city: "Libreville",
        contactPhone: "+241074123456",
        description: "Pagnes wax et tissus africains de qualité",
        status,
        statusReason: status === "SUSPENDED" ? "Test de l'import" : null,
        submittedAt: new Date(),
      },
    });
    return slug;
  }
  let shop = "";

  const file = (reference: string, extra: string[] = []) =>
    [
      HEAD,
      `${shop};${reference};Pagne wax Fleurs;${DESC};Vlisco;${category};Rouge;15 000;18 000;12`,
      `${shop};${reference};Pagne wax Fleurs;${DESC};Vlisco;${category};Bleu;15 000;;5`,
      `${shop};${reference}-B;"Pagne wax ""Oiseaux""";${DESC};;${category};;9900;;3`,
      ...extra,
    ].join("\r\n");

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
    const leaf = await prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } });
    category = leaf.slug;
    catalogToken = await openSession("CATALOG");
    shop = await partnerShop();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("vérifier n'écrit rien ; importer crée les produits en attente, une seule fois", async () => {
    const reference = `WAX-${randomUUID().slice(0, 8)}`;
    const checked = matches(
      CatalogImportReportSchema,
      (await post("/api/v1/admin/catalog-import/check", catalogToken, file(reference)).expect(200))
        .body,
    );
    expect(checked).toMatchObject({
      mode: "check",
      valid: true,
      rows: 3,
      products: 2,
      variants: 3,
      created: 0,
      shops: [{ slug: shop, products: 2 }],
      issues: [],
    });
    const lower = reference.toLowerCase();
    expect(await prisma.product.count({ where: { importReference: lower } })).toBe(0);

    const imported = matches(
      CatalogImportReportSchema,
      (await post("/api/v1/admin/catalog-import", catalogToken, file(reference)).expect(200)).body,
    );
    expect(imported).toMatchObject({ mode: "import", valid: true, created: 2 });
    const product = await prisma.product.findFirstOrThrow({
      where: { importReference: lower },
      include: { variants: { orderBy: { position: "asc" } } },
    });
    expect(product).toMatchObject({ status: "PENDING", brand: "Vlisco" });
    expect(product.shopId).not.toBe(KEMDIA_SHOP_ID);
    expect(product.variants.map((v) => [v.name, v.price, v.compareAtPrice, v.stock])).toEqual([
      ["Rouge", 15000, 18000, 12],
      ["Bleu", 15000, null, 5],
    ]);
    const single = await prisma.product.findFirstOrThrow({
      where: { importReference: `${lower}-b` },
      include: { variants: true },
    });
    expect(single.title).toBe('Pagne wax "Oiseaux"');
    expect(single.variants.map((v) => v.name)).toEqual(["Standard"]);
    const event = await prisma.auditEvent.findFirst({
      where: { action: "catalog.imported" },
      orderBy: { occurredAt: "desc" },
    });
    expect(event?.details).toMatchObject({ products: 2, variants: 3, shops: shop, skipped: 0 });

    // Même fichier relancé (références en majuscules ou minuscules) : rien de nouveau
    const again = matches(
      CatalogImportReportSchema,
      (await post("/api/v1/admin/catalog-import", catalogToken, file(lower)).expect(200)).body,
    );
    expect(again).toMatchObject({ valid: true, products: 0, alreadyImported: 2, created: 0 });
    expect(await prisma.product.count({ where: { importReference: { startsWith: lower } } })).toBe(
      2,
    );
  });

  it("une erreur, et rien n'est écrit : boutique ou catégorie inconnue", async () => {
    const reference = `ERR-${randomUUID().slice(0, 8)}`;
    const report = matches(
      CatalogImportReportSchema,
      (
        await post(
          "/api/v1/admin/catalog-import",
          catalogToken,
          file(reference, [
            `boutique-fantome;X1;Pagne wax Fleurs;${DESC};;${category};;1000;;1`,
            `${shop};X2;Pagne wax Fleurs;${DESC};;categorie-fantome;;1000;;1`,
            `kemdia;X3;Pagne wax Fleurs;${DESC};;${category};;1000;;1`,
          ]),
        ).expect(200)
      ).body,
    );
    expect(report).toMatchObject({ valid: false, created: 0, products: 0, issueCount: 3 });
    expect(report.issues.map((i) => `${i.line}:${i.column}`)).toEqual([
      "5:boutique",
      "6:categorie",
      "7:boutique",
    ]);
    expect(report.issues[2]?.message).toMatch(/boutique officielle/);
    expect(
      await prisma.product.count({
        where: { importReference: { startsWith: reference.toLowerCase() } },
      }),
    ).toBe(0);
  });

  it("mêmes règles que la création d'un produit : un titre sans lettre ni chiffre est refusé dès la vérification", async () => {
    const report = matches(
      CatalogImportReportSchema,
      (
        await post(
          "/api/v1/admin/catalog-import/check",
          catalogToken,
          [HEAD, `${shop};T1;!!!!!;${DESC};;${category};;1000;;1`].join("\n"),
        ).expect(200)
      ).body,
    );
    expect(report).toMatchObject({ valid: false, issueCount: 1 });
    expect(report.issues[0]).toMatchObject({ line: 2, column: null });
    expect(report.issues[0]?.message).toMatch(/lettre ou un chiffre/);
  });

  it("boutique suspendue : refusée", async () => {
    const suspended = await partnerShop("SUSPENDED");
    const report = matches(
      CatalogImportReportSchema,
      (
        await post(
          "/api/v1/admin/catalog-import/check",
          catalogToken,
          [HEAD, `${suspended};S1;Pagne wax Fleurs;${DESC};;${category};;1000;;1`].join("\n"),
        ).expect(200)
      ).body,
    );
    expect(report.issues[0]).toMatchObject({ line: 2, column: "boutique" });
  });

  it("équipe Catalogue seulement ; corps CSV obligatoire", async () => {
    const client = await openSession();
    expect(
      codeOf(
        (await post("/api/v1/admin/catalog-import/check", client, file("A1")).expect(403)).body,
      ),
    ).toBe("ACCES_REFUSE");
    const support = await openSession("SUPPORT");
    await post("/api/v1/admin/catalog-import", support, file("A1")).expect(403);
    expect(
      codeOf(
        (
          await post(
            "/api/v1/admin/catalog-import/check",
            catalogToken,
            JSON.stringify({ csv: "x" }),
            "application/json",
          ).expect(415)
        ).body,
      ),
    ).toBe("FICHIER_IMPORT_INVALIDE");
  });
});
