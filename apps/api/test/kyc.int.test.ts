import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AdminKycPageSchema,
  AdminKycSchema,
  ProblemDetailsSchema,
  ShopSchema,
  VendorKycSchema,
} from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { configureApp } from "../src/http/configure-app.js";
import { SessionService } from "../src/modules/identity/index.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import { KycService } from "../src/modules/vendors/application/kyc.service.js";
import { testDatabaseUrl } from "./integration-db.js";
import { confirmSecondFactor } from "./second-factor-helper.js";

/**
 * Vérification des vendeurs, KYC (S6-T08, ADR-0039 ; BR-024) : vraie API, vraie base, vrai réencodage. Clé de
 * développement (tests) : le chiffrement est le vrai, seule la clé est publique.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");
const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;

const DOSSIER = {
  holderKind: "individual",
  legalName: "Awa Ndong",
  idType: "cni",
  idNumber: "GA 1234 56789",
  rccmNumber: null,
  payoutMethod: "airtel",
  payoutAccount: "077 98 76 54",
  payoutHolder: "Awa Ndong",
};

type Session = { token: string; accountId: string };

describe("Vérification des vendeurs (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Session;
  let photo: Buffer;

  const call = (method: "get" | "post" | "put", url: string, token?: string) => {
    const server = request(app.getHttpServer());
    const req = server[method](url).set("X-Kemdia-Internal-Key", INTERNAL_KEY);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };
  const upload = (token: string, kind: string, bytes: Buffer, type = "image/jpeg") =>
    call("post", `/api/v1/vendors/kyc/documents/${kind}`, token)
      .set("Content-Type", type)
      .send(bytes);

  async function openSession(role?: "ADMIN" | "MODERATOR"): Promise<Session> {
    const email = `kyc.${randomUUID()}@exemple.ga`;
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

  /** Vendeur à boutique validée. */
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
    // Nouvelle session : le rôle vendeur vient d'être accordé
    return { session, shopId: shop.id };
  }

  async function sentFile() {
    const vendor = await openVendor();
    await call("put", "/api/v1/vendors/kyc", vendor.session.token).send(DOSSIER).expect(200);
    await upload(vendor.session.token, "id_front", photo).expect(200);
    await upload(vendor.session.token, "id_back", photo).expect(200);
    await call("post", "/api/v1/vendors/kyc/submit", vendor.session.token).send({}).expect(200);
    return vendor;
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
    // Photo de téléphone simulée, avec des métadonnées EXIF qui ne doivent pas rester
    photo = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 90, b: 160 } },
    })
      .withMetadata({ exif: { IFD0: { Artist: "Awa Ndong", Copyright: "secret-exif" } } })
      .jpeg()
      .toBuffer();
  });

  beforeEach(async () => {
    admin = await openSession("ADMIN");
  });

  afterAll(async () => {
    await app?.close();
  });

  it("parcours complet : dossier, photos, envoi, examen, validation ; rien en clair dans la base", async () => {
    const vendor = await openVendor();
    const token = vendor.session.token;
    expect(codeOf((await call("get", "/api/v1/vendors/kyc", token).expect(404)).body)).toBe(
      "KYC_INTROUVABLE",
    );

    const draft = matches(
      VendorKycSchema,
      (await call("put", "/api/v1/vendors/kyc", token).send(DOSSIER).expect(200)).body,
    );
    expect(draft).toMatchObject({
      status: "draft",
      idNumberEnd: "6789",
      payoutAccountEnd: "7654",
      missingDocuments: ["id_front", "id_back"],
      canEdit: true,
    });
    expect(JSON.stringify(draft)).not.toContain("123456789");

    await upload(token, "id_front", photo).expect(200);
    expect(codeOf((await call("post", "/api/v1/vendors/kyc/submit", token).expect(409)).body)).toBe(
      "KYC_INCOMPLET",
    );
    await upload(token, "id_back", photo).expect(200);
    // Photo non demandée (RCCM pour une personne seule) : refusée
    expect(codeOf((await upload(token, "rccm", photo).expect(422)).body)).toBe("KYC_INVALIDE");

    const sent = matches(
      VendorKycSchema,
      (await call("post", "/api/v1/vendors/kyc/submit", token).expect(200)).body,
    );
    expect(sent).toMatchObject({ status: "pending", canEdit: false, missingDocuments: [] });
    expect(
      codeOf((await call("put", "/api/v1/vendors/kyc", token).send(DOSSIER).expect(409)).body),
    ).toBe("STATUT_KYC_INCOMPATIBLE");

    // Base : numéros et photos chiffrés (ni le numéro, ni l'en-tête WebP, ni l'EXIF en clair)
    const row = await prisma.kycFile.findUniqueOrThrow({
      where: { shopId: vendor.shopId },
      include: { documents: true },
    });
    expect(Buffer.from(row.idNumberBox).includes("GA123456789")).toBe(false);
    expect(Buffer.from(row.payoutAccountBox).includes("077987654")).toBe(false);
    for (const doc of row.documents) {
      expect(Buffer.from(doc.box).includes("WEBP")).toBe(false);
      expect(Buffer.from(doc.box).includes("secret-exif")).toBe(false);
    }

    // Équipe : file, dossier complet, photo ; chaque consultation au journal
    const page = matches(
      AdminKycPageSchema,
      (await call("get", "/api/v1/admin/kyc?status=pending&limit=50", admin.token).expect(200))
        .body,
    );
    expect(page.items.map((i) => i.shopId)).toContain(vendor.shopId);
    const full = matches(
      AdminKycSchema,
      (await call("get", `/api/v1/admin/kyc/${vendor.shopId}`, admin.token).expect(200)).body,
    );
    expect(full).toMatchObject({ idNumber: "GA123456789", payoutAccount: "+241077987654" });
    const image = await call(
      "get",
      `/api/v1/admin/kyc/${vendor.shopId}/documents/id_front`,
      admin.token,
    )
      .buffer(true)
      .expect(200);
    expect(image.headers["content-type"]).toBe("image/webp");
    expect(image.headers["cache-control"]).toBe("private, no-store");
    const decoded = await sharp(image.body as Buffer).metadata();
    expect(decoded).toMatchObject({ format: "webp", width: 1200 });
    expect(decoded.exif).toBeUndefined();
    const viewed = await prisma.auditEvent.findMany({
      where: { targetId: vendor.shopId, action: { in: ["kyc.viewed", "kyc.document_viewed"] } },
    });
    expect(viewed).toHaveLength(2);

    await call("post", `/api/v1/admin/kyc/${vendor.shopId}/approve`, admin.token)
      .send({})
      .expect(204);
    const approved = matches(
      VendorKycSchema,
      (await call("get", "/api/v1/vendors/kyc", token).expect(200)).body,
    );
    expect(approved).toMatchObject({ status: "approved", canEdit: false });
  });

  it("refus avec motif, correction, effacement des photos 30 jours après la décision", async () => {
    const vendor = await sentFile();
    expect(
      codeOf(
        (
          await call("post", `/api/v1/admin/kyc/${vendor.shopId}/reject`, admin.token)
            .send({ reason: "x" })
            .expect(422)
        ).body,
      ),
    ).toBe("KYC_INVALIDE");
    await call("post", `/api/v1/admin/kyc/${vendor.shopId}/reject`, admin.token)
      .send({ reason: "Photo du recto floue, merci de la reprendre" })
      .expect(204);
    const rejected = matches(
      VendorKycSchema,
      (await call("get", "/api/v1/vendors/kyc", vendor.session.token).expect(200)).body,
    );
    expect(rejected).toMatchObject({
      status: "rejected",
      canEdit: true,
      rejectionReason: "Photo du recto floue, merci de la reprendre",
    });

    // 30 jours plus tard : photos effacées, le dossier (et la décision) reste
    await prisma.kycFile.update({
      where: { shopId: vendor.shopId },
      data: { documentsPurgeAt: new Date(Date.now() - 1000) },
    });
    expect(await app.get(KycService).purge()).toBeGreaterThanOrEqual(2);
    expect(await prisma.kycDocument.count({ where: { shopId: vendor.shopId } })).toBe(0);
    expect(
      codeOf(
        (
          await call(
            "get",
            `/api/v1/admin/kyc/${vendor.shopId}/documents/id_front`,
            admin.token,
          ).expect(404)
        ).body,
      ),
    ).toBe("DOCUMENT_INTROUVABLE");

    // Correction : le dossier repasse en préparation, les photos sont à renvoyer
    const fixed = matches(
      VendorKycSchema,
      (await upload(vendor.session.token, "id_front", photo).expect(200)).body,
    );
    expect(fixed).toMatchObject({
      status: "draft",
      rejectionReason: null,
      missingDocuments: ["id_back"],
    });
  });

  it("accès : brouillon invisible de l'équipe ; modérateur et autre vendeur refusés ; photo illisible ou trop petite", async () => {
    const vendor = await openVendor();
    await call("put", "/api/v1/vendors/kyc", vendor.session.token).send(DOSSIER).expect(200);
    expect(
      codeOf(
        (await call("get", `/api/v1/admin/kyc/${vendor.shopId}`, admin.token).expect(404)).body,
      ),
    ).toBe("KYC_INTROUVABLE");
    const drafts = matches(
      AdminKycPageSchema,
      (await call("get", "/api/v1/admin/kyc?limit=50", admin.token).expect(200)).body,
    );
    expect(drafts.items.map((i) => i.shopId)).not.toContain(vendor.shopId);

    const moderator = await openSession("MODERATOR");
    await call("get", "/api/v1/admin/kyc", moderator.token).expect(403);
    // Un autre vendeur ne voit que SON dossier (aucun ici)
    const other = await openVendor();
    await call("get", "/api/v1/vendors/kyc", other.session.token).expect(404);
    // Un client sans boutique : pas d'accès
    const client = await openSession();
    await call("get", "/api/v1/vendors/kyc", client.token).expect(403);

    expect(
      codeOf(
        (
          await upload(
            vendor.session.token,
            "id_front",
            Buffer.from("pas une image"),
            "image/png",
          ).expect(415)
        ).body,
      ),
    ).toBe("FORMAT_IMAGE_INVALIDE");
    const tiny = await sharp({
      create: { width: 120, height: 90, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    expect(
      codeOf((await upload(vendor.session.token, "id_front", tiny, "image/png").expect(422)).body),
    ).toBe("IMAGE_TROP_PETITE");
    expect(
      codeOf(
        (
          await call("put", "/api/v1/vendors/kyc", vendor.session.token)
            .send({ ...DOSSIER, payoutMethod: "moov" })
            .expect(422)
        ).body,
      ),
    ).toBe("KYC_INVALIDE");
  });
});
