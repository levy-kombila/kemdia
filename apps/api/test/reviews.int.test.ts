import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  AdminReviewPageSchema,
  KEMDIA_SHOP_ID,
  MyReviewSchema,
  OrderQuoteSchema,
  OrderSchema,
  ProblemDetailsSchema,
  ReviewPageSchema,
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
import { ReviewsPersonalData } from "../src/modules/reviews/index.js";
import { TransactionContext } from "../src/database/transaction-context.js";
import { testDatabaseUrl } from "./integration-db.js";
import { confirmSecondFactor } from "./second-factor-helper.js";

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
type Session = { token: string; accountId: string };

/** Avis des clients (S8-T01, ADR-0056) : achat livré, modération, note de la fiche, effacement. */
describe("Avis des clients (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let variantId = "";
  let slug = "";
  let listingId = "";

  const call = (method: "get" | "post" | "put" | "delete", url: string, token?: string) => {
    const server = request(app.getHttpServer());
    const req = server[method](url).set("X-Kemdia-Internal-Key", INTERNAL_KEY);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  async function openSession(role?: "CATALOG"): Promise<Session> {
    const email = `avis.${randomUUID()}@exemple.ga`;
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

  async function placeOrder(client: Session): Promise<Order> {
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
            payment: { method: "cod" },
          })
          .expect(201)
      ).body,
    );
  }
  const deliver = async (reference: string) => {
    const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
    // Statuts dans l'ordre que la base exige
    for (const status of ["PREPARING", "SHIPPED", "DELIVERED"] as const) {
      await prisma.order.update({ where: { id: order.id }, data: { status } });
    }
  };
  const listing = () => prisma.listing.findUniqueOrThrow({ where: { id: listingId } });

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
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { product: { shopId: KEMDIA_SHOP_ID } },
      orderBy: [{ price: "asc" }, { sku: "asc" }],
      include: { product: { include: { listing: true } } },
    });
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { stock: 500, isActive: true },
    });
    variantId = variant.id;
    slug = variant.product.listing.slug;
    listingId = variant.product.listingId;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("achat livré obligatoire ; note seule publiée ; la note de la fiche suit les avis réels", async () => {
    const awa = await openSession();
    // Sans commande : pas d'avis possible
    expect(
      matches(
        MyReviewSchema,
        (await call("get", `/api/v1/products/${slug}/reviews/mine`, awa.token).expect(200)).body,
      ),
    ).toEqual({ canReview: false, review: null });
    expect(
      codeOf(
        (
          await call("put", `/api/v1/products/${slug}/reviews/mine`, awa.token)
            .send({ rating: 5 })
            .expect(403)
        ).body,
      ),
    ).toBe("ACHAT_REQUIS");

    // Commande en route : toujours pas ; livrée : oui
    const order = await placeOrder(awa);
    await call("put", `/api/v1/products/${slug}/reviews/mine`, awa.token)
      .send({ rating: 5 })
      .expect(403);
    await deliver(order.reference);
    const mine = (
      await call("put", `/api/v1/products/${slug}/reviews/mine`, awa.token)
        .send({ rating: 4 })
        .expect(200)
    ).body as { status: string };
    expect(mine.status).toBe("published");
    expect(await listing()).toMatchObject({ rating: 4, reviewCount: 1 });

    // Page publique : prénom et initiale, achat vérifié, jamais le compte
    const page = await call("get", `/api/v1/products/${slug}/reviews`).expect(200);
    const body = matches(ReviewPageSchema, page.body);
    expect(body.summary).toEqual({ count: 1, average: 4, distribution: [0, 0, 0, 1, 0] });
    expect(body.items[0]).toMatchObject({
      rating: 4,
      authorName: "Awa N.",
      verifiedPurchase: true,
    });
    expect(JSON.stringify(page.body)).not.toContain(awa.accountId);

    // Note et commentaire mal remplis
    expect(
      codeOf(
        (
          await call("put", `/api/v1/products/${slug}/reviews/mine`, awa.token)
            .send({ rating: 4, comment: "Bof" })
            .expect(422)
        ).body,
      ),
    ).toBe("AVIS_INVALIDE");
    await call("put", `/api/v1/products/${slug}/reviews/mine`, awa.token)
      .send({ rating: 9 })
      .expect(400);
    await call("put", `/api/v1/products/${slug}/reviews/mine`, awa.token)
      .send({ rating: 4, accountId: randomUUID() })
      .expect(400);
  });

  it("commentaire : en attente, publié ou refusé par l'équipe Catalogue (journal) ; retrait", async () => {
    const bob = await openSession();
    const staff = await openSession("CATALOG");
    const client = await openSession();
    const order = await placeOrder(bob);
    await deliver(order.reference);
    const before = await listing();

    await call("put", `/api/v1/products/${slug}/reviews/mine`, bob.token)
      .send({ rating: 1, comment: "Arrivé abîmé, emballage déchiré." })
      .expect(200);
    // En attente : pas compté, pas visible
    expect(await listing()).toMatchObject({ reviewCount: before.reviewCount });
    // File de l'équipe : réservée au rôle Catalogue
    await call("get", "/api/v1/admin/reviews", client.token).expect(403);
    const queue = matches(
      AdminReviewPageSchema,
      (await call("get", "/api/v1/admin/reviews", staff.token).expect(200)).body,
    );
    const pending = queue.items.find((r) => r.comment === "Arrivé abîmé, emballage déchiré.")!;
    expect(pending).toMatchObject({ status: "pending", listing: { slug } });
    // S9-T02 : première photo de la fiche, pour la vignette de la file
    const photo = (await prisma.listing.findFirstOrThrow({ where: { slug } })).images[0] ?? null;
    expect(pending.listing?.image).toBe(photo);

    // Refus sans motif : refusé ; avec motif : refusé et tracé
    await call("post", `/api/v1/admin/reviews/${pending.id}/reject`, staff.token)
      .send({ version: pending.date, reason: "" })
      .expect(422);
    // Sans la version lue : corps invalide
    await call("post", `/api/v1/admin/reviews/${pending.id}/publish`, staff.token)
      .send({})
      .expect(400);
    await call("post", `/api/v1/admin/reviews/${pending.id}/reject`, staff.token)
      .send({ version: pending.date, reason: "Merci de décrire le produit lui-même" })
      .expect(200);
    const mine = matches(
      MyReviewSchema,
      (await call("get", `/api/v1/products/${slug}/reviews/mine`, bob.token).expect(200)).body,
    );
    expect(mine.review).toMatchObject({
      status: "rejected",
      rejectReason: "Merci de décrire le produit lui-même",
    });
    expect(
      codeOf(
        (
          await call("post", `/api/v1/admin/reviews/${pending.id}/publish`, staff.token)
            .send({ version: pending.date })
            .expect(409)
        ).body,
      ),
    ).toBe("AVIS_DEJA_TRAITE");
    const event = await prisma.auditEvent.findFirst({
      where: { targetId: pending.id, action: "review.rejected" },
    });
    expect(event?.actorId).toBe(staff.accountId);

    // Nouvel essai : de nouveau en attente, puis publié et compté
    await call("put", `/api/v1/products/${slug}/reviews/mine`, bob.token)
      .send({ rating: 2, comment: "Tissu correct mais couleurs ternes." })
      .expect(200);
    const read = matches(
      AdminReviewPageSchema,
      (await call("get", "/api/v1/admin/reviews", staff.token).expect(200)).body,
    ).items.find((r) => r.id === pending.id)!;
    // L'auteur modifie son texte pendant que l'équipe le lit : la décision sur l'ancien texte est refusée
    await call("put", `/api/v1/products/${slug}/reviews/mine`, bob.token)
      .send({ rating: 2, comment: "Texte changé après la lecture de l'équipe." })
      .expect(200);
    expect(
      codeOf(
        (
          await call("post", `/api/v1/admin/reviews/${pending.id}/publish`, staff.token)
            .send({ version: read.date })
            .expect(409)
        ).body,
      ),
    ).toBe("AVIS_MODIFIE");
    expect(await listing()).toMatchObject({ reviewCount: before.reviewCount });
    const reread = matches(
      AdminReviewPageSchema,
      (await call("get", "/api/v1/admin/reviews", staff.token).expect(200)).body,
    ).items.find((r) => r.id === pending.id)!;
    expect(reread.comment).toBe("Texte changé après la lecture de l'équipe.");
    await call("post", `/api/v1/admin/reviews/${pending.id}/publish`, staff.token)
      .send({ version: reread.date })
      .expect(200);
    expect(await listing()).toMatchObject({ reviewCount: before.reviewCount + 1 });

    // Fiche retirée de la vente : l'avis reste visible et retirable par son auteur, plus modifiable
    await prisma.listing.update({ where: { id: listingId }, data: { status: "ARCHIVED" } });
    try {
      const offline = matches(
        MyReviewSchema,
        (await call("get", `/api/v1/products/${slug}/reviews/mine`, bob.token).expect(200)).body,
      );
      expect(offline).toMatchObject({ canReview: false, review: { status: "published" } });
      await call("put", `/api/v1/products/${slug}/reviews/mine`, bob.token)
        .send({ rating: 5 })
        .expect(404);
      // Retrait par l'auteur : la note de la fiche suit
      await call("delete", `/api/v1/products/${slug}/reviews/mine`, bob.token).expect(204);
    } finally {
      await prisma.listing.update({ where: { id: listingId }, data: { status: "PUBLISHED" } });
    }
    expect(await listing()).toMatchObject({ reviewCount: before.reviewCount });
    await call("delete", `/api/v1/products/${slug}/reviews/mine`, bob.token).expect(404);
  });

  it("effacement du compte : ses avis partent, la note de la fiche est recalculée ; copie des données", async () => {
    const carl = await openSession();
    const order = await placeOrder(carl);
    await deliver(order.reference);
    await call("put", `/api/v1/products/${slug}/reviews/mine`, carl.token)
      .send({ rating: 1 })
      .expect(200);
    const counted = (await listing()).reviewCount;
    const data = app.get(ReviewsPersonalData);
    const tx = app.get(TransactionContext);
    const copy = await tx.run(() => data.export(carl.accountId));
    expect(copy).toEqual([expect.objectContaining({ note: 1, nomAffiche: "Awa N." })]);
    await tx.run(() => data.erase(carl.accountId));
    expect(await prisma.review.count({ where: { accountId: carl.accountId } })).toBe(0);
    expect((await listing()).reviewCount).toBe(counted - 1);
  });
});
