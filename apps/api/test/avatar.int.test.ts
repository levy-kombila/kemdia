import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CurrentSessionSchema } from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { configureApp } from "../src/http/configure-app.js";
import { SessionService } from "../src/modules/identity/index.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import { IdentityPersonalData } from "../src/modules/identity/infrastructure/identity-personal-data.js";
import { TransactionContext } from "../src/database/transaction-context.js";
import { testDatabaseUrl } from "./integration-db.js";

const INTERNAL_KEY = randomBytes(32).toString("base64url");

/** Photo de profil (S7.5-T08, ADR-0055) : envoi, recadrage, lecture privée, retrait, effacement avec le compte. */
describe("Photo de profil (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  async function openSession(): Promise<{ token: string; accountId: string }> {
    const email = `photo.${randomUUID()}@exemple.ga`;
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
    const opened = await app.get(SessionService).open(account);
    return { token: opened.token, accountId: account.id };
  }
  const as = (token: string) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
        .set("Authorization", `Bearer ${token}`),
    upload: (file: Buffer, type = "image/jpeg") =>
      request(app.getHttpServer())
        .post("/api/v1/auth/avatar")
        .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
        .set("Authorization", `Bearer ${token}`)
        .set("Content-Type", type)
        .send(file),
    remove: () =>
      request(app.getHttpServer())
        .delete("/api/v1/auth/avatar")
        .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
        .set("Authorization", `Bearer ${token}`),
  });
  const session = async (token: string) =>
    CurrentSessionSchema.parse((await as(token).get("/api/v1/auth/session").expect(200)).body);

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

  afterAll(async () => {
    await app.close();
  });

  it("envoi : carré de 256 px en WebP sans métadonnées, version dans la session, lecture par le titulaire seul", async () => {
    const awa = await openSession();
    const bob = await openSession();
    expect((await session(awa.token)).account.avatar).toBeNull();

    // Portrait de 1 200 × 1 800 avec des métadonnées : recadré au centre, métadonnées retirées
    const jpeg = await sharp({
      create: { width: 1200, height: 1800, channels: 3, background: { r: 30, g: 120, b: 60 } },
    })
      .jpeg()
      .withExif({ IFD0: { Make: "Téléphone d'Awa", Copyright: "privé" } })
      .toBuffer();
    const sent = await as(awa.token).upload(jpeg).expect(200);
    const version = (sent.body as { avatar: string }).avatar;
    expect(version).toMatch(/^[0-9a-f]{16}$/);
    expect((await session(awa.token)).account.avatar).toBe(version);

    const photo = await as(awa.token).get("/api/v1/auth/avatar").expect(200);
    expect(photo.headers["content-type"]).toBe("image/webp");
    expect(photo.headers["cache-control"]).toBe("private, no-cache");
    const meta = await sharp(photo.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();
    await as(awa.token)
      .get("/api/v1/auth/avatar")
      .set("If-None-Match", photo.headers.etag as string)
      .expect(304);

    // Chacun sa photo : Bob n'en a pas (erreur jamais gardée en cache)
    const none = await as(bob.token).get("/api/v1/auth/avatar").expect(404);
    expect(none.headers["cache-control"]).toBe("no-store");
    // Sans session : refusé
    await request(app.getHttpServer())
      .get("/api/v1/auth/avatar")
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
      .expect(401);

    // Nouvelle photo : nouvelle version
    const png = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 4,
        background: { r: 200, g: 10, b: 10, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const again = (await as(awa.token).upload(png, "image/png").expect(200)).body as {
      avatar: string;
    };
    expect(again.avatar).not.toBe(version);

    // Retrait : les initiales reviennent ; un second retrait n'a plus rien à retirer
    await as(awa.token).remove().expect(204);
    expect((await session(awa.token)).account.avatar).toBeNull();
    await as(awa.token).get("/api/v1/auth/avatar").expect(404);
    await as(awa.token).remove().expect(404);
  });

  it("refus : faux fichier, trop petite, type non pris en charge", async () => {
    const awa = await openSession();
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    const fake = await as(awa.token).upload(html).expect(422);
    expect((fake.body as { code: string }).code).toBe("PHOTO_INVALIDE");
    const tiny = await sharp({
      create: { width: 120, height: 120, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    expect(((await as(awa.token).upload(tiny).expect(422)).body as { code: string }).code).toBe(
      "PHOTO_INVALIDE",
    );
    // Corps JSON (pas une image) : 415
    await request(app.getHttpServer())
      .post("/api/v1/auth/avatar")
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
      .set("Authorization", `Bearer ${awa.token}`)
      .send({ image: "x" })
      .expect(415);
    expect((await session(awa.token)).account.avatar).toBeNull();
  });

  it("effacement du compte : la photo part avec lui ; la copie des données la mentionne", async () => {
    const awa = await openSession();
    const jpeg = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    await as(awa.token).upload(jpeg).expect(200);
    const data = new IdentityPersonalData(app.get(TransactionContext));
    const copy = (await data.export(awa.accountId)) as {
      photoDeProfil: { presente: boolean; image: string };
    };
    expect(copy.photoDeProfil.presente).toBe(true);
    expect(copy.photoDeProfil.image).toMatch(/^data:image\/webp;base64,UklGR/);
    await app.get(TransactionContext).run(() => data.erase(awa.accountId, new Date()));
    expect(await prisma.accountAvatar.count({ where: { accountId: awa.accountId } })).toBe(0);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: awa.accountId } });
    expect(account.avatarVersion).toBeNull();
  });
});
