import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  AdminInvoicePageSchema,
  AdminInvoiceSchema,
  BillingSettingsSchema,
  CashToCollectListSchema,
  InvoiceListSchema,
  OrderQuoteSchema,
  OrderSchema,
  PaymentSchema,
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
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import {
  PAYMENT_PROVIDER,
  PaymentService,
  type PaymentProvider,
} from "../src/modules/payments/index.js";
import {
  INVOICE_MAILER,
  INVOICE_POLICY,
  type InvoiceMailer,
} from "../src/modules/payments/application/ports.js";
import { InvoiceService } from "../src/modules/payments/application/invoice.service.js";
import type { InvoiceRecord } from "../src/modules/payments/domain/invoice.js";
import { InvoiceEmailScheduler } from "../src/modules/payments/infrastructure/invoice-emails.js";
import { testDatabaseUrl } from "./integration-db.js";
import { confirmSecondFactor } from "./second-factor-helper.js";

/**
 * Factures et avoirs sur une VRAIE base (S5-T06, ADR-0028), par HTTP : facture au paiement reçu (Mobile Money,
 * espèces), avoir à l'annulation, numéros sans trou, PDF téléchargeable par son seul client, envoi par e-mail,
 * informations de l'entreprise copiées et figées, règles de la base.
 */
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;
const newPhone = () => `07${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
const ADDRESS = {
  fullName: "Marie Nze",
  phone: "077 12 34 56",
  cityId: "libreville",
  neighborhood: "Glass",
  landmark: "Portail bleu face à la pharmacie",
};
const sequenceOf = (number: string) => Number(number.slice(-6));

class FakeProvider implements PaymentProvider {
  readonly name = "simule";
  readonly available = true;
  request(payment: { paymentId: string }) {
    return Promise.resolve({ providerRef: `SIM-${payment.paymentId}` });
  }
}

class FakeMailer implements InvoiceMailer {
  readonly available = true;
  readonly sent: { to: string; number: string; pdf: Uint8Array }[] = [];
  fail = false;
  send(to: string, invoice: InvoiceRecord, _firstName: string, pdf: Uint8Array) {
    if (this.fail) return Promise.reject(new Error("panne"));
    this.sent.push({ to, number: invoice.number, pdf });
    return Promise.resolve();
  }
}

describe("Factures (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let payments: PaymentService;
  const mailer = new FakeMailer();
  const policy = { requireCompleteSettings: false };
  let admin = { token: "", accountId: "", email: "" };
  let client = { token: "", accountId: "", email: "" };
  let variantId = "";

  const call = (method: "get" | "post" | "put", url: string, token: string) => {
    const server = request(app.getHttpServer());
    const req =
      method === "get" ? server.get(url) : method === "post" ? server.post(url) : server.put(url);
    return req.set("X-Kemdia-Internal-Key", INTERNAL_KEY).set("Authorization", `Bearer ${token}`);
  };
  const placeOrder = async (
    method: "airtel" | "cod" = "airtel",
    token = client.token,
  ): Promise<Order> => {
    await call("post", "/api/v1/cart/items", token).send({ variantId, quantity: 1 }).expect(200);
    const q = matches(
      OrderQuoteSchema,
      (await call("post", "/api/v1/orders/quote", token).send({ cityId: "libreville" }).expect(200))
        .body,
    );
    return matches(
      OrderSchema,
      (
        await call("post", "/api/v1/orders", token)
          .send({
            idempotencyKey: randomUUID(),
            expectedTotal: q.total,
            delivery: ADDRESS,
            payment: method === "cod" ? { method } : { method, phone: newPhone() },
          })
          .expect((res) => {
            if (res.status !== 201) throw new Error(JSON.stringify(res.body));
          })
      ).body,
    );
  };
  /** Commande Mobile Money payée (résultat de l'opérateur appliqué). */
  const paidOrder = async (token = client.token): Promise<Order> => {
    const order = await placeOrder("airtel", token);
    const payment = matches(
      PaymentSchema,
      (await call("post", `/api/v1/orders/${order.reference}/payments`, token).send({}).expect(201))
        .body,
    );
    await payments.applyProviderResult({
      paymentId: payment.id,
      providerRef: `SIM-${payment.id}`,
      outcome: "succeeded",
      amount: payment.amount,
    });
    return order;
  };
  const invoicesOf = async (reference: string, token = client.token) =>
    matches(
      InvoiceListSchema,
      (await call("get", `/api/v1/orders/${reference}/invoices`, token).expect(200)).body,
    ).items;

  async function openSession(role?: "ADMIN" | "FINANCE" | "CATALOG") {
    const email = `facture.${randomUUID()}@exemple.ga`;
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
    return { token: opened.token, accountId: account.id, email };
  }

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
      .overrideProvider(INVOICE_MAILER)
      .useValue(mailer)
      .overrideProvider(INVOICE_POLICY)
      .useValue(policy)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
    prisma = app.get(PrismaService);
    payments = app.get(PaymentService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "catalog"."product_variants", "catalog"."products", "catalog"."categories" CASCADE',
    );
    await importCatalog(prepareDemoCatalog(demoCatalog), {
      categories: new PrismaCategoryRepository(prisma),
      products: new PrismaProductRepository(prisma),
    });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE "catalog"."product_variants" SET "stock" = 50, "is_active" = true, "compare_at_price" = NULL`,
    );
    await prisma.$executeRawUnsafe(`UPDATE "catalog"."products" SET "status" = 'PUBLISHED'`);
    variantId = (
      await prisma.productVariant.findFirstOrThrow({ orderBy: [{ price: "asc" }, { sku: "asc" }] })
    ).id;
    admin = await openSession("ADMIN");
    client = await openSession();
    mailer.fail = false;
    mailer.sent.length = 0;
    policy.requireCompleteSettings = false;
    app.get(InvoiceService).clock = () => new Date();
  });

  afterAll(async () => {
    await app.close();
  });

  it("paiement Mobile Money reçu : facture établie, montants et copies figées, PDF téléchargeable par son client seulement", async () => {
    const order = await paidOrder();
    const [invoice] = await invoicesOf(order.reference);
    expect(invoice).toMatchObject({
      kind: "invoice",
      orderReference: order.reference,
      total: order.total,
    });
    expect(invoice!.number).toMatch(new RegExp(`^KMD-F-${new Date().getUTCFullYear()}-\\d{6}$`));
    const row = await prisma.invoice.findUniqueOrThrow({ where: { number: invoice!.number } });
    expect(row).toMatchObject({
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      paymentMethod: "AIRTEL",
      vatMention: "TVA non applicable",
    });
    expect(row.buyer).toMatchObject({ name: "Marie Nze", phone: "+241077123456" });
    expect(row.lines).toMatchObject([{ quantity: 1 }]);

    const pdf = await call(
      "get",
      `/api/v1/orders/${order.reference}/invoices/${invoice!.number}`,
      client.token,
    )
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toBe(
      `attachment; filename="${invoice!.number}.pdf"`,
    );
    expect(pdf.headers["cache-control"]).toBe("no-store");
    const body = pdf.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(body)).getTitle()).toBe(`Facture ${invoice!.number}`);

    // Un autre compte : ni la liste ni le PDF
    const other = await openSession();
    expect(
      codeOf(
        (await call("get", `/api/v1/orders/${order.reference}/invoices`, other.token).expect(404))
          .body,
      ),
    ).toBe("COMMANDE_INTROUVABLE");
    await call(
      "get",
      `/api/v1/orders/${order.reference}/invoices/${invoice!.number}`,
      other.token,
    ).expect(404);
    // Un numéro d'une autre commande, même du bon compte : introuvable
    const second = await paidOrder();
    const [secondInvoice] = await invoicesOf(second.reference);
    const wrong = await call(
      "get",
      `/api/v1/orders/${order.reference}/invoices/${secondInvoice!.number}`,
      client.token,
    ).expect(404);
    expect(codeOf(wrong.body)).toBe("FACTURE_INTROUVABLE");
    await call(
      "get",
      `/api/v1/orders/${order.reference}/invoices/pas-un-numero`,
      client.token,
    ).expect(400);
  });

  it("commande pas encore payée : aucune facture ; résultat reçu deux fois : une seule facture", async () => {
    const order = await placeOrder();
    expect(await invoicesOf(order.reference)).toEqual([]);
    const payment = matches(
      PaymentSchema,
      (
        await call("post", `/api/v1/orders/${order.reference}/payments`, client.token)
          .send({})
          .expect(201)
      ).body,
    );
    const result = {
      paymentId: payment.id,
      providerRef: `SIM-${payment.id}`,
      outcome: "succeeded" as const,
      amount: payment.amount,
    };
    await payments.applyProviderResult(result);
    await payments.applyProviderResult(result);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("numéros sans trou, même pour deux paiements au même moment", async () => {
    const other = await openSession();
    const [a, b] = await Promise.all([placeOrder("airtel"), placeOrder("airtel", other.token)]);
    const start = async (order: Order, token: string) =>
      matches(
        PaymentSchema,
        (
          await call("post", `/api/v1/orders/${order.reference}/payments`, token)
            .send({})
            .expect(201)
        ).body,
      );
    const [pa, pb] = [await start(a, client.token), await start(b, other.token)];
    await Promise.all(
      [pa, pb].map((p) =>
        payments.applyProviderResult({
          paymentId: p.id,
          providerRef: `SIM-${p.id}`,
          outcome: "succeeded",
          amount: p.amount,
        }),
      ),
    );
    const numbers = [
      (await invoicesOf(a.reference))[0]!.number,
      (await invoicesOf(b.reference, other.token))[0]!.number,
    ]
      .map(sequenceOf)
      .sort((x, y) => x - y);
    expect(numbers[1]! - numbers[0]!).toBe(1);
    const year = new Date().getUTCFullYear();
    const counter = await prisma.invoiceCounter.findUniqueOrThrow({
      where: { kind_year: { kind: "INVOICE", year } },
    });
    expect(counter.lastNumber).toBeGreaterThanOrEqual(numbers[1]!);
  });

  it("paiement à la livraison encaissé : facture ; annulation d'une commande facturée : avoir du même montant", async () => {
    const cod = await placeOrder("cod");
    await call("post", `/api/v1/admin/orders/${cod.reference}/cod-collected`, admin.token)
      .send({ amount: cod.total })
      .expect(201);
    expect(await invoicesOf(cod.reference)).toMatchObject([{ kind: "invoice", total: cod.total }]);
    expect(
      (await prisma.invoice.findFirstOrThrow({ where: { orderId: cod.id } })).paymentMethod,
    ).toBe("COD");

    const paid = await paidOrder();
    await call("post", `/api/v1/admin/orders/${paid.reference}/cancel`, admin.token)
      .send({ note: "Rupture chez le fournisseur" })
      .expect(200);
    const documents = await invoicesOf(paid.reference);
    expect(documents.map((d) => d.kind)).toEqual(["invoice", "credit_note"]);
    expect(documents[1]!.number).toMatch(/^KMD-A-\d{4}-\d{6}$/);
    expect(documents[1]!.total).toBe(documents[0]!.total);
    const credit = await prisma.invoice.findUniqueOrThrow({
      where: { number: documents[1]!.number },
    });
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { number: documents[0]!.number },
    });
    expect(credit.creditedInvoiceId).toBe(invoice.id);
    // Annulation d'une commande non facturée : pas d'avoir
    const unpaid = await placeOrder();
    await call("post", `/api/v1/admin/orders/${unpaid.reference}/cancel`, admin.token)
      .send({ note: "Doublon" })
      .expect(200);
    expect(await invoicesOf(unpaid.reference)).toEqual([]);
  });

  it("envoi par e-mail : PDF joint à l'adresse vérifiée du compte, une seule fois ; panne : nouvel essai, 5 au plus", async () => {
    const scheduler = app.get(InvoiceEmailScheduler);
    // Base partagée : d'abord, les factures d'autres tests encore en attente d'envoi
    const unsent = () =>
      prisma.invoice.count({ where: { emailSentAt: null, emailAttempts: { lt: 5 } } });
    for (let i = 0; i < 100 && (await unsent()) > 0; i++) await scheduler.run();
    const order = await paidOrder();
    const [invoice] = await invoicesOf(order.reference);
    mailer.fail = true;
    await scheduler.run();
    let row = await prisma.invoice.findUniqueOrThrow({ where: { number: invoice!.number } });
    expect(row).toMatchObject({ emailAttempts: 1, emailSentAt: null });
    mailer.fail = false;
    // Essai suivant pas avant 1 minute
    await scheduler.run();
    expect(mailer.sent.filter((m) => m.number === invoice!.number)).toHaveLength(0);
    app.get(InvoiceService).clock = () => new Date(Date.now() + 61_000);
    await scheduler.run();
    const mine = mailer.sent.filter((m) => m.number === invoice!.number);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.to).toBe(client.email);
    expect(Buffer.from(mine[0]!.pdf).subarray(0, 5).toString()).toBe("%PDF-");
    row = await prisma.invoice.findUniqueOrThrow({ where: { number: invoice!.number } });
    expect(row.emailSentAt).not.toBeNull();
    await scheduler.run();
    expect(mailer.sent.filter((m) => m.number === invoice!.number)).toHaveLength(1);
  });

  it("informations de l'entreprise : réglées par l'administrateur (journal), copiées dans les NOUVELLES factures seulement", async () => {
    const before = await paidOrder();
    const initial = matches(
      BillingSettingsSchema,
      (await call("get", "/api/v1/admin/settings/billing", admin.token).expect(200)).body,
    );
    await call("get", "/api/v1/admin/settings/billing", client.token).expect(403);
    const legalName = `Kemdia SARL ${randomBytes(3).toString("hex")}`;
    try {
      // Champ inconnu : refusé (schéma strict)
      await call("put", "/api/v1/admin/settings/billing", admin.token)
        .send({ ...initial, legalName })
        .expect(400);
      const saved = matches(
        BillingSettingsSchema,
        (
          await call("put", "/api/v1/admin/settings/billing", admin.token)
            .send({
              legalName,
              address: initial.address,
              city: initial.city,
              phone: initial.phone,
              email: initial.email,
              taxId: "NIF-123456",
              tradeRegister: initial.tradeRegister,
              vatMention: initial.vatMention,
            })
            .expect(200)
        ).body,
      );
      expect(saved).toMatchObject({ legalName, taxId: "NIF-123456" });
      expect(
        await prisma.auditEvent.count({
          where: { actorId: admin.accountId, action: "settings.billing_updated" },
        }),
      ).toBe(1);
      const after = await paidOrder();
      const oldRow = await prisma.invoice.findFirstOrThrow({ where: { orderId: before.id } });
      const newRow = await prisma.invoice.findFirstOrThrow({ where: { orderId: after.id } });
      expect((oldRow.seller as { legalName: string }).legalName).toBe(initial.legalName);
      expect(newRow.seller).toMatchObject({ legalName, taxId: "NIF-123456" });
    } finally {
      await prisma.billingSettings.update({
        where: { id: 1 },
        data: { legalName: initial.legalName, taxId: initial.taxId },
      });
    }
  });

  it("préproduction / production : pas de facture tant que l'entreprise n'est pas renseignée, puis rattrapage", async () => {
    const saved = await prisma.billingSettings.findUniqueOrThrow({ where: { id: 1 } });
    policy.requireCompleteSettings = true;
    try {
      await prisma.billingSettings.update({
        where: { id: 1 },
        data: { updatedAt: null, updatedBy: null },
      });
      const order = await paidOrder();
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
        "CONFIRMED",
      );
      expect(await invoicesOf(order.reference)).toEqual([]);
      await app.get(InvoiceEmailScheduler).run();
      expect(await invoicesOf(order.reference)).toEqual([]);
      // L'administrateur renseigne l'entreprise : la facture est établie au passage suivant
      await prisma.billingSettings.update({
        where: { id: 1 },
        data: { updatedAt: new Date(), updatedBy: admin.accountId },
      });
      await app.get(InvoiceEmailScheduler).run();
      expect(await invoicesOf(order.reference)).toMatchObject([
        { kind: "invoice", total: order.total },
      ]);
    } finally {
      await prisma.billingSettings.update({
        where: { id: 1 },
        data: { updatedAt: saved.updatedAt, updatedBy: saved.updatedBy },
      });
    }
  });

  it("la base protège les factures : figées, numéros au bon format, compteur qui n'avance que d'un, rien ne s'efface", async () => {
    const order = await paidOrder();
    const row = await prisma.invoice.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payments"."invoices" SET "total" = 1 WHERE "id" = '${row.id}'`,
      ),
    ).rejects.toThrow(/figée|invoices_amounts_check/);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payments"."invoices" SET "seller" = '{"legalName":"Autre"}'::jsonb WHERE "id" = '${row.id}'`,
      ),
    ).rejects.toThrow(/figée/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "payments"."invoices" WHERE "id" = '${row.id}'`),
    ).rejects.toThrow(/suppression interdite/);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "payments"."invoice_counters" SET "last_number" = "last_number" + 5`,
      ),
    ).rejects.toThrow(/avance que d'un/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "payments"."invoice_counters"`),
    ).rejects.toThrow(/suppression interdite/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "payments"."billing_settings"`),
    ).rejects.toThrow(/suppression interdite/);
  });

  describe("Finance (S7.5-T05)", () => {
    it("factures : liste du plus récent, recherche par numéro ou par commande, PDF tracé ; réservé à la Finance", async () => {
      const finance = await openSession("FINANCE");
      const first = await paidOrder();
      const second = await paidOrder();
      const page = matches(
        AdminInvoicePageSchema,
        (await call("get", "/api/v1/admin/invoices", finance.token).expect(200)).body,
      );
      const mine = page.items.filter((i) =>
        [first.reference, second.reference].includes(i.orderReference),
      );
      expect(mine.map((i) => i.orderReference)).toEqual([second.reference, first.reference]);
      expect(mine[0]).toMatchObject({ kind: "invoice", buyerName: "Marie Nze", email: "pending" });

      const [invoice] = await invoicesOf(first.reference);
      const byNumber = matches(
        AdminInvoicePageSchema,
        (
          await call(
            "get",
            `/api/v1/admin/invoices?q=${invoice!.number.toLowerCase()}`,
            finance.token,
          ).expect(200)
        ).body,
      );
      expect(byNumber.items.map((i) => i.number)).toEqual([invoice!.number]);
      const byOrder = matches(
        AdminInvoicePageSchema,
        (
          await call("get", `/api/v1/admin/invoices?q=${first.reference}`, finance.token).expect(
            200,
          )
        ).body,
      );
      expect(byOrder).toMatchObject({ items: [{ number: invoice!.number }], nextCursor: null });
      await call("get", "/api/v1/admin/invoices?q=DROP%20TABLE", finance.token).expect(400);
      await call("get", `/api/v1/admin/invoices?after=${"a".repeat(40)}`, finance.token).expect(
        400,
      );

      const pdf = await call("get", `/api/v1/admin/invoices/${invoice!.number}`, finance.token)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
      expect(
        await prisma.auditEvent.count({
          where: { action: "invoice.downloaded", actorId: finance.accountId },
        }),
      ).toBe(1);
      await call("get", "/api/v1/admin/invoices/KMD-F-2000-000001", finance.token).expect(404);
      // Le catalogue et le client n'y ont pas accès
      const catalog = await openSession("CATALOG");
      await call("get", "/api/v1/admin/invoices", catalog.token).expect(403);
      await call("get", "/api/v1/admin/invoices", client.token).expect(403);
    });

    it("renvoi au client : pas pendant l'envoi automatique, puis tout de suite, tracé, 10 minutes entre deux", async () => {
      const finance = await openSession("FINANCE");
      const order = await paidOrder();
      const [invoice] = await invoicesOf(order.reference);
      const resend = () =>
        call("post", `/api/v1/admin/invoices/${invoice!.number}/resend`, finance.token).send({});
      expect(codeOf((await resend().expect(409)).body)).toBe("ENVOI_IMPOSSIBLE");
      // Envoi automatique fait (la base n'accepte qu'une date posée une fois)
      await prisma.invoice.update({
        where: { number: invoice!.number },
        data: { emailSentAt: new Date() },
      });
      const done = matches(AdminInvoiceSchema, (await resend().expect(200)).body);
      expect(done.email).toBe("sent");
      expect(mailer.sent.filter((m) => m.number === invoice!.number)).toEqual([
        expect.objectContaining({ to: client.email }),
      ]);
      expect(
        await prisma.auditEvent.count({
          where: { action: "invoice.resent", actorId: finance.accountId },
        }),
      ).toBe(1);
      expect(codeOf((await resend().expect(409)).body)).toBe("ENVOI_IMPOSSIBLE");
      expect(mailer.sent.filter((m) => m.number === invoice!.number)).toHaveLength(1);
    });

    it("renvoi : deux clics simultanés → un seul e-mail ; 5 renvois par client et par heure (relecture)", async () => {
      const finance = await openSession("FINANCE");
      const numbers: string[] = [];
      for (let i = 0; i < 6; i++) {
        const order = await paidOrder();
        numbers.push((await invoicesOf(order.reference))[0]!.number);
        // Livrée : la commande ne compte plus parmi les 3 commandes ouvertes du client
        for (const status of ["PREPARING", "SHIPPED", "DELIVERED"] as const) {
          await prisma.order.update({ where: { id: order.id }, data: { status } });
        }
      }
      await prisma.invoice.updateMany({
        where: { number: { in: numbers } },
        data: { emailSentAt: new Date() },
      });
      const resend = (number: string) =>
        call("post", `/api/v1/admin/invoices/${number}/resend`, finance.token).send({});
      const both = await Promise.all([resend(numbers[0]!), resend(numbers[0]!)]);
      expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(mailer.sent.filter((m) => m.number === numbers[0])).toHaveLength(1);
      for (const number of numbers.slice(1, 5)) await resend(number).expect(200);
      expect(codeOf((await resend(numbers[5]!).expect(409)).body)).toBe("ENVOI_IMPOSSIBLE");
    });

    it("espèces à encaisser : commandes à la livraison expédiées ou livrées, livrées d'abord ; disparaît une fois encaissée", async () => {
      const finance = await openSession("FINANCE");
      const shipped = await placeOrder("cod");
      const delivered = await placeOrder("cod");
      const waiting = await placeOrder("cod");
      // Statuts dans l'ordre que la base exige
      const advance = async (id: string, to: ("PREPARING" | "SHIPPED" | "DELIVERED")[]) => {
        for (const status of to) await prisma.order.update({ where: { id }, data: { status } });
      };
      await advance(shipped.id, ["PREPARING", "SHIPPED"]);
      await advance(delivered.id, ["PREPARING", "SHIPPED", "DELIVERED"]);
      const list = async () =>
        matches(
          CashToCollectListSchema,
          (await call("get", "/api/v1/admin/cash-to-collect", finance.token).expect(200)).body,
        ).items.filter((i) =>
          [shipped.reference, delivered.reference, waiting.reference].includes(i.reference),
        );
      expect(await list()).toEqual([
        expect.objectContaining({
          reference: delivered.reference,
          status: "delivered",
          total: delivered.total,
        }),
        expect.objectContaining({
          reference: shipped.reference,
          status: "shipped",
          cityName: "Libreville",
        }),
      ]);
      await call("post", `/api/v1/admin/orders/${delivered.reference}/cod-collected`, finance.token)
        .send({ amount: delivered.total })
        .expect(201);
      expect((await list()).map((i) => i.reference)).toEqual([shipped.reference]);
      const catalog = await openSession("CATALOG");
      await call("get", "/api/v1/admin/cash-to-collect", catalog.token).expect(403);
    });
  });
});
