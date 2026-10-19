import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  AccountDataExportSchema,
  AccountDeletionStatusSchema,
  KEMDIA_SHOP_ID,
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
import { Argon2PasswordHasher } from "../src/modules/identity/infrastructure/argon2-password-hasher.js";
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from "../src/modules/payments/application/ports.js";
import { PrivacyService } from "../src/modules/privacy/application/privacy.service.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Données personnelles sur une VRAIE base (S7-T08, ADR-0047), par HTTP : copie JSON, empêchements, suppression du
 * compte (mot de passe, tous les modules effacés ensemble, commandes et paiements anonymisés, règles de la base),
 * comptes inactifs (avis 30 jours avant, effacement, connexion qui annule). Comptes neufs à chaque test.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");
const PASSWORD = "Une phrase de passe assez longue";
// Numéro propre à ce fichier : la limite d'envois par numéro (par heure) ne gêne pas les autres tests
const PAYER = "+241074123456";

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

class FakeProvider implements PaymentProvider {
  readonly name = "simule";
  readonly available = true;
  request(payment: { paymentId: string }) {
    return Promise.resolve({ providerRef: `SIM-${payment.paymentId}` });
  }
}

type Session = { token: string; accountId: string; email: string };

describe("Données personnelles (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordHash = "";
  let variantId = "";

  const call = (method: "get" | "post", url: string, token?: string) => {
    const server = request(app.getHttpServer());
    const req = server[method](url).set("X-Kemdia-Internal-Key", INTERNAL_KEY);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  async function openSession(role?: "ADMIN" | "MODERATOR"): Promise<Session> {
    const email = `donnees.${randomUUID()}@exemple.ga`;
    const now = new Date();
    const account = Account.register({
      id: randomUUID(),
      firstName: "Awa",
      lastName: "Ndong",
      identifier: requireIdentifier(email),
      passwordHash,
      now,
    });
    account.markVerified(requireIdentifier(email), now);
    await new PrismaAccountRepository(prisma).save(account);
    if (role) await prisma.accountRole.create({ data: { accountId: account.id, role } });
    const opened = await app.get(SessionService).open(account);
    return { token: opened.token, accountId: account.id, email };
  }

  async function placeOrder(client: Session, method: "cod" | "airtel" = "cod"): Promise<Order> {
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
            payment: method === "cod" ? { method } : { method, phone: "074 12 34 56" },
          })
          .expect(201)
      ).body,
    );
  }

  const cancel = (client: Session, reference: string) =>
    call("post", `/api/v1/orders/${reference}/cancel`, client.token).send({}).expect(200);
  const deletion = async (client: Session) =>
    matches(
      AccountDeletionStatusSchema,
      (await call("get", "/api/v1/account/deletion", client.token).expect(200)).body,
    );
  const remove = (client: Session, password = PASSWORD, confirm: unknown = true) =>
    call("post", "/api/v1/account/delete", client.token).send({ password, confirm });

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: testDatabaseUrl(),
      API_INTERNAL_KEY: INTERNAL_KEY,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(new FakeProvider())
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
    prisma = app.get(PrismaService);
    passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "catalog"."product_variants", "catalog"."products", "catalog"."categories" CASCADE',
    );
    await importCatalog(prepareDemoCatalog(demoCatalog), {
      categories: new PrismaCategoryRepository(prisma),
      products: new PrismaProductRepository(prisma),
    });
    const cheapest = await prisma.productVariant.findFirstOrThrow({
      where: { product: { shopId: KEMDIA_SHOP_ID } },
      orderBy: [{ price: "asc" }, { sku: "asc" }],
    });
    await prisma.productVariant.update({
      where: { id: cheapest.id },
      data: { stock: 500, isActive: true },
    });
    variantId = cheapest.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("copie JSON : tout le compte, jamais de secret ; inscrite au journal d'audit", async () => {
    const client = await openSession();
    const order = await placeOrder(client);
    const res = await call("get", "/api/v1/account/data", client.token).expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="kemdia-mes-donnees.json"',
    );
    const data = matches(AccountDataExportSchema, res.body);
    expect(data.format).toBe("kemdia-donnees-personnelles/1");
    expect(data.identite).toMatchObject({ compte: { id: client.accountId, email: client.email } });
    const text = JSON.stringify(data);
    expect(text).toContain(order.reference);
    expect(text).toContain("Portail bleu");
    // Ni empreinte, ni jeton de session
    expect(text).not.toContain("argon2");
    expect(text).not.toContain(client.token);
    expect(text).not.toMatch(/tokenHash|passwordHash|secret/);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: "account.data_exported", actorId: client.accountId },
    });
    expect(audit).not.toBeNull();
    // La copie suivante contient le journal du compte : ses actions, avec SON adresse IP seulement
    const again = matches(
      AccountDataExportSchema,
      (await call("get", "/api/v1/account/data", client.token).expect(200)).body,
    );
    expect(again.journal).toMatchObject({
      evenements: expect.arrayContaining([
        expect.objectContaining({ action: "account.data_exported", parVous: true }),
      ]),
    });
    // Sans session : refusé
    await call("get", "/api/v1/account/data").expect(401);
    // Commande rendue : la liste « prêtes à expédier » des autres fichiers de tests n'en hérite pas
    await cancel(client, order.reference);
  });

  it("empêchements : commande en cours, puis suppression possible une fois la commande annulée", async () => {
    const client = await openSession();
    const order = await placeOrder(client);
    expect(await deletion(client)).toEqual({ possible: false, reasons: ["COMMANDE_EN_COURS"] });
    expect(codeOf((await remove(client).expect(409)).body)).toBe("COMMANDE_EN_COURS");
    // Rien n'a été effacé
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: client.accountId } })).email,
    ).toBe(client.email);
    await cancel(client, order.reference);
    expect(await deletion(client)).toEqual({ possible: true, reasons: [] });
  });

  it("empêchements : paiement Mobile Money sans réponse de l'opérateur (même après l'annulation)", async () => {
    const client = await openSession();
    const order = await placeOrder(client, "airtel");
    const row = await prisma.order.findUniqueOrThrow({ where: { reference: order.reference } });
    await prisma.payment.create({
      data: {
        id: randomUUID(),
        orderId: row.id,
        accountId: client.accountId,
        method: "AIRTEL",
        amount: row.total,
        phone: PAYER,
        status: "PENDING",
        attempt: 9,
        provider: "simule",
        expiresAt: new Date(Date.now() + 180_000),
      },
    });
    expect((await deletion(client)).reasons).toEqual(["COMMANDE_EN_COURS", "PAIEMENT_EN_ATTENTE"]);
    await cancel(client, order.reference);
    // Annulée, mais l'opérateur peut encore confirmer : toujours refusé (remboursement possible)
    expect(await deletion(client)).toEqual({ possible: false, reasons: ["PAIEMENT_EN_ATTENTE"] });
    expect(codeOf((await remove(client).expect(409)).body)).toBe("PAIEMENT_EN_ATTENTE");
  });

  it("compte de l'équipe : jamais supprimé par lui-même", async () => {
    const staff = await openSession("MODERATOR");
    expect(await deletion(staff)).toEqual({ possible: false, reasons: ["COMPTE_EQUIPE"] });
  });

  it("suppression : mot de passe exigé, tous les modules effacés ensemble, commandes et paiements anonymisés", async () => {
    const client = await openSession();
    // Commande payée par Mobile Money puis annulée et remboursée (paiement et remboursement écrits directement)
    const order = await placeOrder(client, "airtel");
    const row = await prisma.order.findUniqueOrThrow({ where: { reference: order.reference } });
    const paymentId = randomUUID();
    await prisma.payment.create({
      data: {
        id: paymentId,
        orderId: row.id,
        accountId: client.accountId,
        method: "AIRTEL",
        amount: row.total,
        phone: PAYER,
        status: "SUCCEEDED",
        attempt: 9,
        provider: "simule",
        completedAt: new Date(),
      },
    });
    await cancel(client, order.reference);
    await prisma.refund.create({
      data: {
        id: randomUUID(),
        paymentId,
        orderId: row.id,
        orderReference: order.reference,
        amount: row.total,
        method: "AIRTEL",
        phone: PAYER,
        reason: "ADMIN_CANCEL",
        status: "DONE",
        externalReference: `REMB-${randomUUID().slice(0, 8)}`,
        doneBy: client.accountId,
        doneAt: new Date(),
      },
    });
    await call("post", "/api/v1/cart/items", client.token).send({ variantId, quantity: 1 });

    // Corps invalide (case non cochée) : 400 ; mauvais mot de passe : 422, inscrit au journal
    await remove(client, PASSWORD, false).expect(400);
    expect(codeOf((await remove(client, "pas le bon mot de passe").expect(422)).body)).toBe(
      "MOT_DE_PASSE_INCORRECT",
    );
    expect(
      await prisma.auditEvent.count({
        where: { action: "account.delete_failed", actorId: client.accountId },
      }),
    ).toBe(1);

    await remove(client).expect(204);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: client.accountId } });
    expect(account).toMatchObject({
      firstName: "Compte",
      lastName: "supprimé",
      email: null,
      phone: null,
      status: "DISABLED",
    });
    expect(account.deletedAt).not.toBeNull();
    expect(account.passwordHash).not.toBe(passwordHash);
    expect(await prisma.session.count({ where: { accountId: client.accountId } })).toBe(0);
    expect(await prisma.cart.count({ where: { accountId: client.accountId } })).toBe(0);

    const anonymized = await prisma.order.findUniqueOrThrow({ where: { id: row.id } });
    expect(anonymized).toMatchObject({
      deliveryName: "",
      deliveryPhone: null,
      deliveryNeighborhood: "",
      deliveryLandmark: "",
      paymentPhone: null,
      // Montants et statut gardés (comptabilité)
      total: row.total,
      status: "CANCELLED",
    });
    expect(anonymized.anonymizedAt).not.toBeNull();
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.phone).toBeNull();
    expect(payment.amount).toBe(row.total);
    const refund = await prisma.refund.findUniqueOrThrow({ where: { paymentId } });
    expect(refund.phone).toBeNull();
    expect(refund.status).toBe("DONE");

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "account.deleted", targetId: client.accountId },
    });
    expect(audit.details).toEqual({ reason: "request" });

    // La session ne vaut plus rien ; une deuxième demande ne fait rien
    await call("get", "/api/v1/account/deletion", client.token).expect(401);
    await remove(client).expect(401);
    // Connexion impossible avec l'ancienne adresse
    await call("post", "/api/v1/auth/login")
      .send({ identifier: client.email, password: PASSWORD })
      .expect(401);
  });

  it("règles de la base : l'anonymisation n'efface que les coordonnées, et une seule fois", async () => {
    const client = await openSession();
    const order = await placeOrder(client);
    const id = (await prisma.order.findUniqueOrThrow({ where: { reference: order.reference } })).id;
    // Commande en cours : jamais anonymisée, même proprement
    await expect(
      prisma.$executeRaw`UPDATE "orders"."orders" SET "delivery_name" = '', "delivery_phone" = NULL,
        "delivery_neighborhood" = '', "delivery_landmark" = '', "anonymized_at" = now() WHERE "id" = ${id}::uuid`,
    ).rejects.toThrow(/anonymisation/);
    await cancel(client, order.reference);
    // Anonymiser en changeant AUSSI le montant : refusé
    await expect(
      prisma.$executeRaw`UPDATE "orders"."orders" SET "delivery_name" = '', "delivery_phone" = NULL,
        "delivery_neighborhood" = '', "delivery_landmark" = '', "anonymized_at" = now(), "total" = "total" + 1
        WHERE "id" = ${id}::uuid`,
    ).rejects.toThrow(/anonymisation/);
    // Anonymiser sans effacer le nom : refusé
    await expect(
      prisma.$executeRaw`UPDATE "orders"."orders" SET "delivery_phone" = NULL, "delivery_neighborhood" = '',
        "delivery_landmark" = '', "anonymized_at" = now() WHERE "id" = ${id}::uuid`,
    ).rejects.toThrow(/anonymisation/);
    await remove(client).expect(204);
    // Une fois anonymisée : figée (date d'anonymisation comprise)
    await expect(
      prisma.$executeRaw`UPDATE "orders"."orders" SET "delivery_name" = 'Retour' WHERE "id" = ${id}::uuid`,
    ).rejects.toThrow(/figée/);
    await expect(
      prisma.$executeRaw`UPDATE "orders"."orders" SET "anonymized_at" = NULL WHERE "id" = ${id}::uuid`,
    ).rejects.toThrow(/définitive/);
    // Un compte effacé ne retrouve jamais d'adresse e-mail
    await expect(
      prisma.$executeRaw`UPDATE "identity"."accounts" SET "email" = 'retour@exemple.ga'
        WHERE "id" = ${client.accountId}::uuid`,
    ).rejects.toThrow(/accounts_deleted_check/);
  });

  it("comptes inactifs : prévenus 30 jours avant, effacés ensuite ; une connexion annule ; l'équipe n'est pas concernée", async () => {
    const privacy = app.get(PrivacyService);
    const sleeper = await openSession();
    const back = await openSession();
    const staff = await openSession("ADMIN");
    const old = new Date();
    old.setUTCFullYear(old.getUTCFullYear() - 3);
    old.setUTCDate(old.getUTCDate() + 10); // inactif depuis 3 ans moins 10 jours : à prévenir
    for (const s of [sleeper, back, staff]) {
      await prisma.account.update({ where: { id: s.accountId }, data: { lastActiveAt: old } });
    }

    const first = await privacy.processInactiveAccounts();
    expect(first.notified).toBeGreaterThanOrEqual(2);
    const noticed = await prisma.account.findMany({
      where: { id: { in: [sleeper.accountId, back.accountId, staff.accountId] } },
      select: { id: true, inactivityNoticeAt: true },
    });
    const noticeOf = (id: string) => noticed.find((a) => a.id === id)?.inactivityNoticeAt;
    expect(noticeOf(sleeper.accountId)).not.toBeNull();
    expect(noticeOf(back.accountId)).not.toBeNull();
    expect(noticeOf(staff.accountId)).toBeNull();
    expect(
      await prisma.auditEvent.findFirst({
        where: { action: "account.inactivity_notified", targetId: sleeper.accountId },
      }),
    ).not.toBeNull();
    // Deuxième passage le même jour : personne n'est prévenu deux fois, personne n'est effacé
    const again = await privacy.processInactiveAccounts();
    expect(await prisma.account.count({ where: { id: sleeper.accountId, deletedAt: null } })).toBe(
      1,
    );
    expect(again.erased).toBe(0);

    // 31 jours plus tard (avis antidaté) ; entre-temps, « back » s'est reconnecté
    const noticeDate = new Date(Date.now() - 31 * 86_400_000);
    await prisma.account.updateMany({
      where: { id: { in: [sleeper.accountId, back.accountId] } },
      data: { inactivityNoticeAt: noticeDate },
    });
    await app
      .get(SessionService)
      .open((await new PrismaAccountRepository(prisma).findById(back.accountId))!);
    const second = await privacy.processInactiveAccounts();
    expect(second.erased).toBeGreaterThanOrEqual(1);
    const erased = await prisma.account.findUniqueOrThrow({ where: { id: sleeper.accountId } });
    expect(erased).toMatchObject({ email: null, status: "DISABLED" });
    expect(erased.deletedAt).not.toBeNull();
    const kept = await prisma.account.findUniqueOrThrow({ where: { id: back.accountId } });
    expect(kept).toMatchObject({ email: back.email, deletedAt: null, inactivityNoticeAt: null });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "account.deleted", targetId: sleeper.accountId },
    });
    expect(audit).toMatchObject({ actorType: "SYSTEM", details: { reason: "inactivity" } });
  });
});
