import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalog } from "@kemdia/contracts/demo";
import {
  KEMDIA_SHOP_ID,
  OrderQuoteSchema,
  OrderSchema,
  PaymentSchema,
  ProblemDetailsSchema,
  ShopSchema,
  VendorOrderPageSchema,
  VendorOrderSchema,
  VendorProductSchema,
  type Order,
  type VendorOrder,
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
import { OverdueOrdersScheduler } from "../src/modules/orders/infrastructure/overdue-orders.js";
import { PaymentService } from "../src/modules/payments/index.js";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from "../src/modules/payments/application/ports.js";
import {
  VENDOR_ORDER_MAILER,
  type NewOrderNotice,
  type VendorOrderMailer,
} from "../src/modules/vendors/application/ports.js";
import { VendorOrderNotifier } from "../src/modules/vendors/application/vendor-order-notifier.service.js";
import { testDatabaseUrl } from "./integration-db.js";
import { confirmSecondFactor } from "./second-factor-helper.js";

/**
 * Commandes des vendeurs sur une VRAIE base (S6-T07, ADR-0038 ; BR-013), par HTTP : une part par boutique, visible du
 * vendeur seulement une fois la commande confirmée, sans données du client ; accepter (→ en préparation quand toutes
 * les boutiques ont accepté), refuser ou ne pas répondre en 24 h (→ commande entière annulée, stock remis, remboursement
 * « à faire » d'une commande payée) ; isolement entre boutiques ; e-mail au vendeur ; règles de la base.
 * Commandes et parts ne s'effacent jamais : comptes, boutiques et produits neufs à chaque test.
 */
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

class FakeProvider implements PaymentProvider {
  readonly name = "simule";
  readonly available = true;
  request(payment: { paymentId: string }) {
    return Promise.resolve({ providerRef: `SIM-${payment.paymentId}` });
  }
}

class FakeMailer implements VendorOrderMailer {
  readonly available = true;
  readonly sent: { to: string; notice: NewOrderNotice }[] = [];
  send(to: string, notice: NewOrderNotice) {
    this.sent.push({ to, notice });
    return Promise.resolve();
  }
}

type Session = { token: string; accountId: string; email: string };
type Vendor = { session: Session; shopId: string; variantId: string; price: number };

describe("Commandes des vendeurs (PostgreSQL, HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Session;
  let moderator: Session;
  let client: Session;
  let categoryId = "";
  let kemdiaVariant = "";
  const mailer = new FakeMailer();

  const call = (method: "get" | "post", url: string, token?: string) => {
    const server = request(app.getHttpServer());
    const req = (method === "get" ? server.get(url) : server.post(url)).set(
      "X-Kemdia-Internal-Key",
      INTERNAL_KEY,
    );
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  async function openSession(role?: "ADMIN" | "MODERATOR"): Promise<Session> {
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
    if (role) await confirmSecondFactor(prisma, account.id);
    return { token: opened.token, accountId: account.id, email };
  }

  /** Vendeur à boutique validée, avec un produit validé par la modération (stock 10). */
  async function openVendor(price = 15_000): Promise<Vendor> {
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
    const product = matches(
      VendorProductSchema,
      (
        await call("post", "/api/v1/vendors/products", session.token)
          .send({
            title: `Pagne wax ${randomBytes(3).toString("hex")}`,
            description: "Pagne wax 100 % coton, 6 yards, motifs variés, cousu à Libreville.",
            brand: "Atelier Awa",
            categoryId,
            variants: [{ name: "Rouge", price, stock: 10 }],
          })
          .expect(201)
      ).body,
    );
    const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    await call("post", `/api/v1/moderation/products/${product.id}/approve`, moderator.token)
      .send({ submittedAt: row.submittedAt!.toISOString() })
      .expect(200);
    return { session, shopId: shop.id, variantId: product.variants[0]!.id, price };
  }

  /** Commande du client : ces variantes, une de chaque, au total du devis. */
  async function placeOrder(
    variantIds: string[],
    method: "cod" | "airtel" = "cod",
    as = client,
  ): Promise<Order> {
    for (const variantId of variantIds) {
      await call("post", "/api/v1/cart/items", as.token)
        .send({ variantId, quantity: 1 })
        .expect(200);
    }
    const { total } = matches(
      OrderQuoteSchema,
      (
        await call("post", "/api/v1/orders/quote", as.token)
          .send({ cityId: "libreville" })
          .expect(200)
      ).body,
    );
    return matches(
      OrderSchema,
      (
        await call("post", "/api/v1/orders", as.token)
          .send({
            idempotencyKey: randomUUID(),
            expectedTotal: total,
            delivery: ADDRESS,
            payment: method === "cod" ? { method } : { method, phone: "077 98 76 54" },
          })
          .expect(201)
      ).body,
    );
  }

  const vendorOrder = async (vendor: Vendor, reference: string, status = 200) => {
    const res = await call("get", `/api/v1/vendors/orders/${reference}`, vendor.session.token);
    expect(res.status).toBe(status);
    return res;
  };
  const accept = (vendor: Vendor, reference: string) =>
    call("post", `/api/v1/vendors/orders/${reference}/accept`, vendor.session.token).send({});
  const refuse = (vendor: Vendor, reference: string, reason = "Rupture chez mon fournisseur") =>
    call("post", `/api/v1/vendors/orders/${reference}/refuse`, vendor.session.token).send({
      reason,
    });
  const orderRow = (reference: string) =>
    prisma.order.findUniqueOrThrow({ where: { reference }, include: { shopParts: true } });
  const stockOf = async (id: string) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;
  const auditOf = (action: string, orderId: string) =>
    prisma.auditEvent.findMany({ where: { action, targetId: orderId } });

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: testDatabaseUrl(),
      API_INTERNAL_KEY: INTERNAL_KEY,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    })
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(new FakeProvider())
      .overrideProvider(VENDOR_ORDER_MAILER)
      .useValue(mailer)
      .compile();
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
    client = await openSession();
    // Produit Kemdia bon marché, en stock (le paiement à la livraison est plafonné)
    const cheapest = await prisma.productVariant.findFirstOrThrow({
      where: { product: { shopId: KEMDIA_SHOP_ID } },
      orderBy: [{ price: "asc" }, { sku: "asc" }],
    });
    await prisma.productVariant.update({
      where: { id: cheapest.id },
      data: { stock: 50, isActive: true },
    });
    kemdiaVariant = cheapest.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("commande à la livraison : une part par boutique, le vendeur ne voit que SES articles et la ville", async () => {
    const vendor = await openVendor();
    const order = await placeOrder([kemdiaVariant, vendor.variantId]);
    expect(order.status).toBe("confirmed");
    // La boutique de chaque ligne reste interne
    expect(JSON.stringify(order)).not.toContain(vendor.shopId);

    const row = await orderRow(order.reference);
    const kemdia = row.shopParts.find((p) => p.shopId === KEMDIA_SHOP_ID)!;
    const mine = row.shopParts.find((p) => p.shopId === vendor.shopId)!;
    expect(kemdia).toMatchObject({ status: "ACCEPTED", openedAt: null, dueAt: null });
    expect(mine).toMatchObject({ status: "PENDING", subtotal: vendor.price, itemCount: 1 });
    expect(mine.dueAt!.getTime() - mine.openedAt!.getTime()).toBe(24 * 3_600_000);

    const seen: VendorOrder = matches(
      VendorOrderSchema,
      (await vendorOrder(vendor, order.reference)).body,
    );
    expect(seen).toMatchObject({
      status: "pending",
      orderStatus: "confirmed",
      subtotal: vendor.price,
      cityName: "Libreville",
      canDecide: true,
    });
    expect(seen.lines.map((l) => l.variantId)).toEqual([vendor.variantId]);
    // Ni le nom, ni le téléphone, ni l'adresse du client
    const text = JSON.stringify(seen);
    for (const secret of ["Marie", "Nze", "077", "Glass", "Portail"])
      expect(text).not.toContain(secret);

    const page = matches(
      VendorOrderPageSchema,
      (await call("get", "/api/v1/vendors/orders?status=pending", vendor.session.token).expect(200))
        .body,
    );
    expect(page.items.map((o) => o.reference)).toEqual([order.reference]);
  });

  it("isolement : une autre boutique, un client ou un visiteur ne voient pas la commande", async () => {
    const [mine, other] = [await openVendor(), await openVendor()];
    const order = await placeOrder([mine.variantId]);
    expect(codeOf((await vendorOrder(other, order.reference, 404)).body)).toBe(
      "COMMANDE_INTROUVABLE",
    );
    expect(codeOf((await accept(other, order.reference).expect(404)).body)).toBe(
      "COMMANDE_INTROUVABLE",
    );
    const asClient = await call("get", `/api/v1/vendors/orders/${order.reference}`, client.token);
    expect(asClient.status).toBe(403);
    await call("get", "/api/v1/vendors/orders").expect(401);
    const list = matches(
      VendorOrderPageSchema,
      (await call("get", "/api/v1/vendors/orders", other.session.token).expect(200)).body,
    );
    expect(list.items).toEqual([]);
  });

  it("accepter : la commande passe « en préparation » quand TOUTES les boutiques ont accepté ; journal d'audit", async () => {
    const [a, b] = [await openVendor(), await openVendor()];
    const order = await placeOrder([kemdiaVariant, a.variantId, b.variantId]);

    const first = matches(VendorOrderSchema, (await accept(a, order.reference).expect(200)).body);
    expect(first).toMatchObject({ status: "accepted", orderStatus: "confirmed", canDecide: false });
    // Même envoi deux fois : rien ne change
    await accept(a, order.reference).expect(200);
    const second = matches(VendorOrderSchema, (await accept(b, order.reference).expect(200)).body);
    expect(second.orderStatus).toBe("preparing");

    const row = await orderRow(order.reference);
    expect(row.status).toBe("PREPARING");
    expect(row.shopParts.every((p) => p.status === "ACCEPTED")).toBe(true);
    const events = await auditOf("order.vendor_accepted", row.id);
    expect(events).toHaveLength(2);
    // Déjà acceptée : un refus n'est plus possible
    expect(codeOf((await refuse(a, order.reference).expect(409)).body)).toBe("DECISION_IMPOSSIBLE");
  });

  it("refuser : la commande ENTIÈRE est annulée, stock remis, motif gardé chez Kemdia", async () => {
    const [a, b] = [await openVendor(), await openVendor()];
    const order = await placeOrder([kemdiaVariant, a.variantId, b.variantId]);
    const kemdiaStock = await stockOf(kemdiaVariant);
    await accept(a, order.reference).expect(200);

    expect(codeOf((await refuse(b, order.reference, "  non ").expect(422)).body)).toBe(
      "MOTIF_REFUS_INVALIDE",
    );
    const refused = matches(
      VendorOrderSchema,
      (await refuse(b, order.reference, "  Rupture\nchez mon fournisseur ").expect(200)).body,
    );
    expect(refused).toMatchObject({
      status: "refused",
      orderStatus: "cancelled",
      refusalReason: "Rupture chez mon fournisseur",
    });
    // Le vendeur qui avait accepté voit une commande annulée
    expect(matches(VendorOrderSchema, (await vendorOrder(a, order.reference)).body).status).toBe(
      "cancelled",
    );
    // Le client voit la raison, jamais le motif
    const mine = matches(
      OrderSchema,
      (await call("get", `/api/v1/orders/${order.reference}`, client.token).expect(200)).body,
    );
    expect(mine).toMatchObject({ status: "cancelled", cancelReason: "vendeur_refus" });
    expect(JSON.stringify(mine)).not.toContain("fournisseur");
    // Tout le stock est remis en vente
    expect(await stockOf(kemdiaVariant)).toBe(kemdiaStock + 1);
    expect(await stockOf(a.variantId)).toBe(10);
    expect(await stockOf(b.variantId)).toBe(10);
    const row = await orderRow(order.reference);
    const events = await auditOf("order.vendor_refused", row.id);
    expect(events).toHaveLength(1);
    // Déjà refusée : renvoyée telle quelle ; plus aucune décision possible ailleurs
    await refuse(b, order.reference).expect(200);
    await accept(a, order.reference).expect(200);
  });

  it("sans réponse en 24 h : commande annulée par la tâche planifiée, au nom du serveur", async () => {
    const vendor = await openVendor();
    const order = await placeOrder([vendor.variantId]);
    const row = await orderRow(order.reference);
    const due = row.shopParts[0]!.dueAt!;
    const scheduler = app.get(OverdueOrdersScheduler);
    // Une minute avant l'échéance : rien
    await scheduler.run(new Date(due.getTime() - 60_000));
    expect((await orderRow(order.reference)).status).toBe("CONFIRMED");
    await scheduler.run(new Date(due.getTime() + 60_000));
    const after = await orderRow(order.reference);
    expect(after).toMatchObject({ status: "CANCELLED", cancelReason: "VENDOR_TIMEOUT" });
    expect(after.shopParts[0]).toMatchObject({ status: "EXPIRED", decidedBy: null });
    expect(await stockOf(vendor.variantId)).toBe(10);
    expect(await auditOf("order.vendor_timeout", row.id)).toHaveLength(1);
    const seen = matches(VendorOrderSchema, (await vendorOrder(vendor, order.reference)).body);
    expect(seen).toMatchObject({ status: "expired", canDecide: false });
    expect(codeOf((await accept(vendor, order.reference).expect(409)).body)).toBe(
      "DECISION_IMPOSSIBLE",
    );
  });

  it("Mobile Money : invisible du vendeur avant le paiement ; payée puis refusée → remboursement « à faire »", async () => {
    const vendor = await openVendor();
    const order = await placeOrder([vendor.variantId], "airtel");
    expect(order.status).toBe("pending_payment");
    await vendorOrder(vendor, order.reference, 404);

    const payment = matches(
      PaymentSchema,
      (
        await call("post", `/api/v1/orders/${order.reference}/payments`, client.token)
          .send({})
          .expect(201)
      ).body,
    );
    await app.get(PaymentService).applyProviderResult({
      paymentId: payment.id,
      providerRef: `SIM-${payment.id}`,
      outcome: "succeeded",
      amount: order.total,
    });
    const seen = matches(VendorOrderSchema, (await vendorOrder(vendor, order.reference)).body);
    expect(seen).toMatchObject({ status: "pending", orderStatus: "confirmed", canDecide: true });

    await refuse(vendor, order.reference).expect(200);
    const row = await orderRow(order.reference);
    expect(row).toMatchObject({ status: "CANCELLED", cancelReason: "VENDOR_REFUSED" });
    const refunds = await prisma.refund.findMany({ where: { orderReference: order.reference } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      reason: "VENDOR_CANCEL",
      status: "TO_DO",
      amount: order.total,
    });
  });

  it("liste : filtres et pages, de la plus récente à la plus ancienne", async () => {
    const vendor = await openVendor(5_000);
    const orders: Order[] = [];
    for (let i = 0; i < 3; i++)
      orders.push(await placeOrder([vendor.variantId], "cod", await openSession()));
    await accept(vendor, orders[0]!.reference).expect(200);
    const token = vendor.session.token;
    const first = matches(
      VendorOrderPageSchema,
      (await call("get", "/api/v1/vendors/orders?limit=2", token).expect(200)).body,
    );
    expect(first.items.map((o) => o.reference)).toEqual([
      orders[2]!.reference,
      orders[1]!.reference,
    ]);
    const next = matches(
      VendorOrderPageSchema,
      (
        await call(
          "get",
          `/api/v1/vendors/orders?limit=2&before=${first.nextCursor}`,
          token,
        ).expect(200)
      ).body,
    );
    expect(next.items.map((o) => o.reference)).toEqual([orders[0]!.reference]);
    expect(next.nextCursor).toBeNull();
    const accepted = matches(
      VendorOrderPageSchema,
      (await call("get", "/api/v1/vendors/orders?status=accepted", token).expect(200)).body,
    );
    expect(accepted.items.map((o) => o.reference)).toEqual([orders[0]!.reference]);
    await call("get", "/api/v1/vendors/orders?status=tout", token).expect(400);
    await call("get", "/api/v1/vendors/orders?before=pas-une-position-valide", token).expect(400);
  });

  it("e-mail « nouvelle commande » : une fois, sans données du client ; rien pour une commande déjà décidée", async () => {
    const [a, b] = [await openVendor(), await openVendor()];
    const notifier = app.get(VendorOrderNotifier);
    mailer.sent.length = 0;
    // E-mails restés en attente des tests précédents (commandes décidées) : abandonnés, jamais envoyés
    await notifier.sendPending(500);
    mailer.sent.length = 0;

    const first = await placeOrder([a.variantId], "cod", await openSession());
    const second = await placeOrder([b.variantId], "cod", await openSession());
    await accept(b, second.reference).expect(200);
    await notifier.sendPending(500);
    expect(mailer.sent.map((m) => m.notice.reference)).toEqual([first.reference]);
    expect(mailer.sent[0]).toMatchObject({
      to: a.session.email,
      notice: { firstName: "Awa", itemCount: 1, subtotal: a.price },
    });
    expect(JSON.stringify(mailer.sent)).not.toContain("Marie");
    // Déjà envoyé : pas une seconde fois
    await notifier.sendPending(500);
    expect(mailer.sent).toHaveLength(1);
  });

  it("règles de la base : décision figée, part Kemdia acceptée, aucune suppression", async () => {
    const vendor = await openVendor();
    const order = await placeOrder([kemdiaVariant, vendor.variantId]);
    await accept(vendor, order.reference).expect(200);
    const row = await orderRow(order.reference);
    await expect(
      prisma.orderShopPart.update({
        where: { orderId_shopId: { orderId: row.id, shopId: vendor.shopId } },
        data: { status: "REFUSED", refusalReason: "trop tard pour changer" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.orderShopPart.update({
        where: { orderId_shopId: { orderId: row.id, shopId: vendor.shopId } },
        data: { subtotal: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.orderShopPart.delete({
        where: { orderId_shopId: { orderId: row.id, shopId: KEMDIA_SHOP_ID } },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.orderShopPart.update({
        where: { orderId_shopId: { orderId: row.id, shopId: KEMDIA_SHOP_ID } },
        data: { status: "PENDING", decidedAt: null },
      }),
    ).rejects.toThrow();
    // Ligne de commande : boutique figée (table en ajout seul)
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "orders"."order_items" SET "shop_id" = '${KEMDIA_SHOP_ID}' WHERE "order_id" = '${row.id}'`,
      ),
    ).rejects.toThrow();
  });
});
