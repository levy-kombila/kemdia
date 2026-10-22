import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import { ProblemDetailsSchema, ShopSchema, VendorProductSchema } from "@kemdia/contracts";
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
 * Photos des produits des vendeurs sur une VRAIE base (S6-T04, ADR-0035), par HTTP : envoi et réencodage, retour en
 * modération, photo publique seulement pour un produit visible, retrait immédiat, isolement entre boutiques, droits de
 * la modération, règles de la base.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;

type Session = { token: string; accountId: string };

describe("Photos des produits des vendeurs (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Session;
  let moderator: Session;
  let vendor: Session;
  let shopId = "";
  let categoryId = "";

  const call = (
    method: "get" | "post" | "put" | "patch" | "delete",
    url: string,
    token?: string,
  ) => {
    const server = request(app.getHttpServer());
    const req =
      method === "get"
        ? server.get(url)
        : method === "post"
          ? server.post(url)
          : method === "put"
            ? server.put(url)
            : method === "delete"
              ? server.delete(url)
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
  async function openSession(role?: "ADMIN" | "CATALOG"): Promise<Session> {
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
    // Compte d'équipe : session confirmée par la double authentification (S6-T03)
    if (role) await confirmSecondFactor(prisma, account.id);
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
    moderator = await openSession("CATALOG");
    ({ session: vendor, shopId } = await openVendor());
  });

  afterAll(async () => {
    await app.close();
  });

  let jpeg: Buffer;
  beforeAll(async () => {
    jpeg = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: { r: 180, g: 30, b: 60 } },
    })
      .jpeg()
      .withExif({ IFD0: { Make: "Téléphone d'Awa", Copyright: "privé" } })
      .toBuffer();
  });

  const upload = (productId: string, file: Buffer, type = "image/jpeg", token = vendor.token) =>
    call("post", `/api/v1/vendors/products/${productId}/images`, token)
      .set("Content-Type", type)
      .send(file);
  const imageIdOf = (path: string) => /\/images\/v\/([0-9a-f-]{36})\.webp$/.exec(path)![1]!;
  const publicImage = (imageId: string, size: "large" | "small" = "large") =>
    request(app.getHttpServer())
      .get(`/api/v1/product-images/${imageId}/${size}`)
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });

  it("envoi → réencodée, produit en modération, photo cachée ; validée → publique, en cache court", async () => {
    const product = await create();
    const res = await upload(product.id, jpeg).expect(201);
    const updated = matches(VendorProductSchema, res.body);
    expect(updated.status).toBe("pending");
    expect(updated.images).toHaveLength(1);
    const imageId = imageIdOf(updated.images[0]!);
    // Produit en modération : caché, photo comprise
    expect(await publicStatus(product.slug)).toBe(404);
    expect((await publicImage(imageId)).status).toBe(404);

    // Le vendeur et la modération la voient, jamais en cache partagé
    const own = await call(
      "get",
      `/api/v1/vendors/products/${product.id}/images/${imageId}`,
      vendor.token,
    ).expect(200);
    expect(own.headers["content-type"]).toBe("image/webp");
    expect(own.headers["cache-control"]).toBe("private, no-store");
    await call(
      "get",
      `/api/v1/moderation/products/${product.id}/images/${imageId}`,
      moderator.token,
    ).expect(200);
    // Un client simple n'a pas accès à la modération
    const client = await openSession();
    await call(
      "get",
      `/api/v1/moderation/products/${product.id}/images/${imageId}`,
      client.token,
    ).expect(403);

    await moderate(product.id, "approve", 200);
    const large = await publicImage(imageId).expect(200);
    expect(large.headers["content-type"]).toBe("image/webp");
    expect(large.headers["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=300");
    expect(large.headers["x-content-type-options"]).toBe("nosniff");
    const meta = await sharp(large.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 1600, height: 1200 });
    expect(meta.exif).toBeUndefined();
    const small = await publicImage(imageId, "small").expect(200);
    expect((await sharp(small.body as Buffer).metadata()).width).toBe(480);
    // Copie déjà en main : 304 sans contenu
    await publicImage(imageId)
      .set("If-None-Match", large.headers.etag as string)
      .expect(304);
    // Le produit public montre l'adresse du site
    const pub = await call("get", `/api/v1/products/${product.slug}`).expect(200);
    expect((pub.body as { images: string[] }).images).toEqual([`/images/v/${imageId}.webp`]);

    // S7.5-T02 : fiche en ligne → le vendeur n'ajoute plus de photo (l'équipe corrige la fiche)
    expect(codeOf((await upload(product.id, jpeg).expect(409)).body)).toBe("FICHE_PUBLIEE");

    const audit = await prisma.auditEvent.findMany({
      where: { targetId: product.id, action: "product.submitted" },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.at(-1)?.details).toMatchObject({
      reason: "photo",
      from: "pending",
      image: imageId,
      sha256: (await prisma.productImage.findUniqueOrThrow({ where: { id: imageId } })).sha256,
    });
  });

  it("fichiers refusés : pas une image, déguisée, trop petite, trop lourde, mauvais type annoncé", async () => {
    const product = await create();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(codeOf((await upload(product.id, svg, "image/png").expect(415)).body)).toBe(
      "FORMAT_IMAGE_INVALIDE",
    );
    expect(codeOf((await upload(product.id, svg, "image/svg+xml").expect(415)).body)).toBe(
      "FORMAT_IMAGE_INVALIDE",
    );
    const tiny = await sharp({
      create: { width: 120, height: 120, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(codeOf((await upload(product.id, tiny, "image/png").expect(422)).body)).toBe(
      "IMAGE_TROP_PETITE",
    );
    const heavy = Buffer.alloc(5 * 1024 * 1024 + 1);
    jpeg.copy(heavy);
    await upload(product.id, heavy).expect(413);
    // Corps JSON au lieu du fichier
    expect(
      codeOf(
        (
          await call("post", `/api/v1/vendors/products/${product.id}/images`, vendor.token)
            .send({ image: "data:image/png;base64,AAAA" })
            .expect(415)
        ).body,
      ),
    ).toBe("FORMAT_IMAGE_INVALIDE");
    // Sans session : 401, le fichier n'est même pas lu
    await request(app.getHttpServer())
      .post(`/api/v1/vendors/products/${product.id}/images`)
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
      .set("Content-Type", "image/jpeg")
      .send(jpeg)
      .expect(401);
    expect(await prisma.productImage.count({ where: { productId: product.id } })).toBe(0);
  });

  it("retrait : effacée tout de suite, plus jamais servie, tracée ; nouvel ordre sans modération", async () => {
    const product = await create();
    const first = matches(VendorProductSchema, (await upload(product.id, jpeg).expect(201)).body);
    const png = await sharp(jpeg).png().toBuffer();
    const second = matches(
      VendorProductSchema,
      (await upload(product.id, png, "image/png").expect(201)).body,
    );
    const [a, b] = second.images.map(imageIdOf);
    expect(imageIdOf(first.images[0]!)).toBe(a);

    // Avant la publication : le vendeur range ses photos (sans nouvelle demande de modération)
    const order = await call("put", `/api/v1/vendors/products/${product.id}/images`, vendor.token)
      .send({ images: [b, a] })
      .expect(200);
    const reorderedProduct = matches(VendorProductSchema, order.body);
    expect(reorderedProduct.status).toBe("pending");
    expect(reorderedProduct.images.map(imageIdOf)).toEqual([b, a]);
    expect(
      codeOf(
        (
          await call("put", `/api/v1/vendors/products/${product.id}/images`, vendor.token)
            .send({ images: [b, b] })
            .expect(422)
        ).body,
      ),
    ).toBe("PRODUIT_INVALIDE");

    await moderate(product.id, "approve", 200);
    await publicImage(a!).expect(200);
    // S7.5-T02 : fiche en ligne → le vendeur ne retire plus de photo ; l'équipe, oui (effacée, tracée)
    const refused = await call(
      "delete",
      `/api/v1/vendors/products/${product.id}/images/${a}`,
      vendor.token,
    ).expect(409);
    expect(codeOf(refused.body)).toBe("FICHE_PUBLIEE");
    const removed = await call(
      "delete",
      `/api/v1/moderation/listings/${product.listing.id}/images/${a}`,
      moderator.token,
    ).expect(200);
    expect((removed.body as { images: string[] }).images.map(imageIdOf)).toEqual([b]);
    const after = matches(
      VendorProductSchema,
      (await call("get", `/api/v1/vendors/products/${product.id}`, vendor.token).expect(200)).body,
    );
    expect(after).toMatchObject({ status: "published" });
    expect(after.images.map(imageIdOf)).toEqual([b]);
    await publicImage(a!).expect(404);
    expect(await prisma.productImage.findUnique({ where: { id: a! } })).toBeNull();
    await call(
      "delete",
      `/api/v1/moderation/listings/${product.listing.id}/images/${a}`,
      moderator.token,
    ).expect(404);
    const trace = await prisma.auditEvent.findFirst({
      where: { targetId: product.listing.id, action: "listing.image_removed" },
    });
    expect(trace?.details).toMatchObject({
      image: a,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(
      await prisma.auditEvent.count({
        where: { targetId: product.id, action: "product.images_reordered" },
      }),
    ).toBe(1);
  });

  it("une boutique ne voit ni ne touche les photos d'une autre ; boutique suspendue : photos cachées", async () => {
    const product = await create();
    const added = matches(VendorProductSchema, (await upload(product.id, jpeg).expect(201)).body);
    const imageId = imageIdOf(added.images[0]!);
    await moderate(product.id, "approve", 200);
    await publicImage(imageId).expect(200);

    const { session: other } = await openVendor();
    await upload(product.id, jpeg, "image/jpeg", other.token).expect(404);
    await call(
      "get",
      `/api/v1/vendors/products/${product.id}/images/${imageId}`,
      other.token,
    ).expect(404);
    await call(
      "delete",
      `/api/v1/vendors/products/${product.id}/images/${imageId}`,
      other.token,
    ).expect(404);
    // Sa propre photo, rattachée à un autre produit dans l'adresse : introuvable
    const mine = await create(other.token);
    await call("get", `/api/v1/vendors/products/${mine.id}/images/${imageId}`, other.token).expect(
      404,
    );

    await call("post", `/api/v1/admin/shops/${shopId}/suspend`, admin.token)
      .send({ reason: "Contrefaçons signalées" })
      .expect(200);
    await publicImage(imageId).expect(404);
    await call("post", `/api/v1/admin/shops/${shopId}/approve`, admin.token).send({}).expect(200);
    await publicImage(imageId).expect(200);
  });

  it("10 photos au plus ; produit archivé : pas d'ajout", async () => {
    const product = await create();
    const small = await sharp(jpeg).resize(300).jpeg().toBuffer();
    for (let i = 0; i < 10; i += 1) await upload(product.id, small).expect(201);
    expect(codeOf((await upload(product.id, small).expect(409)).body)).toBe("TROP_DE_PHOTOS");
    expect(await prisma.productImage.count({ where: { productId: product.id } })).toBe(10);

    const archived = await create();
    await call("post", `/api/v1/vendors/products/${archived.id}/archive`, vendor.token)
      .send({})
      .expect(200);
    await upload(archived.id, small).expect(409);
    expect(await prisma.productImage.count({ where: { productId: archived.id } })).toBe(0);
  });

  it("la base refuse ce que le domaine refuse : autre chose qu'un WebP, modification d'une photo", async () => {
    const product = await create();
    const added = matches(VendorProductSchema, (await upload(product.id, jpeg).expect(201)).body);
    const imageId = imageIdOf(added.images[0]!);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "catalog"."product_images" SET "width" = 10 WHERE "id" = '${imageId}'`,
      ),
    ).rejects.toThrow(/ne se modifie pas/);
    const html = Buffer.from("<html><script>alert(1)</script></html>".padEnd(64, " "));
    await expect(
      prisma.productImage.create({
        data: {
          id: randomUUID(),
          productId: product.id,
          large: html,
          small: html,
          width: 10,
          height: 10,
          sha256: "0".repeat(64),
        },
      }),
    ).rejects.toThrow();
  });
});
