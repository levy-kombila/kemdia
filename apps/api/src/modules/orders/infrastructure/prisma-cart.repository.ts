import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { CartRepository, MergeOutcome } from "../application/ports.js";
import { Cart, type CartLine } from "../domain/cart.js";
import { OrdersError } from "../domain/orders-error.js";
import { busyError, postgresCode } from "./postgres-errors.js";

/** L'activité d'un panier consulté est notée au plus une fois par heure (une écriture de moins par page vue). */
const TOUCH_EVERY_MS = 60 * 60_000;

/**
 * Attente maximale du verrou d'un panier. Au-delà, la demande est refusée (`PANIER_OCCUPE`, réessayer) au lieu de garder
 * une connexion à la base : une rafale de demandes d'un même compte ne peut pas épuiser les connexions des autres
 * clients (relecture de sécurité du S5-T01).
 */
const LOCK_TIMEOUT = "1s";

/**
 * Paniers (schéma `orders`, S5-T01). Les modifications passent par `update` et `merge` : une transaction qui verrouille
 * la ligne du panier (`INSERT … ON CONFLICT DO UPDATE` prend le verrou), relit les lignes, applique la règle du domaine
 * et n'écrit que ce qui a changé. Deux demandes simultanées d'un même compte passent donc l'une après l'autre,
 * et la limite de 50 lignes tient (vérifiée aussi par un déclencheur SQL).
 */
@Injectable()
export class PrismaCartRepository implements CartRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionContext,
  ) {}

  async read(accountId: string, now: Date): Promise<CartLine[]> {
    const cart = await this.prisma.cart.findUnique({
      where: { accountId },
      select: {
        id: true,
        updatedAt: true,
        items: {
          select: { variantId: true, quantity: true },
          orderBy: [{ addedAt: "asc" }, { variantId: "asc" }],
        },
      },
    });
    if (!cart) return [];
    if (now.getTime() - cart.updatedAt.getTime() > TOUCH_EVERY_MS) {
      await this.prisma.cart.updateMany({
        where: { id: cart.id, updatedAt: cart.updatedAt },
        data: { updatedAt: now },
      });
    }
    return cart.items;
  }

  async update<T>(
    accountId: string,
    now: Date,
    change: (cart: Cart) => T,
  ): Promise<{ lines: CartLine[]; result: T }> {
    return this.locked(accountId, now, async (cartId, before) => {
      const cart = Cart.restore(before);
      const result = change(cart);
      return { lines: await this.save(cartId, before, cart.items, now), result };
    });
  }

  async merge<T>(
    accountId: string,
    now: Date,
    mergeId: string,
    change: (cart: Cart) => T,
  ): Promise<MergeOutcome<T>> {
    return this.locked(accountId, now, async (cartId, before, lastMergeId) => {
      // Même réunion renvoyée (double chargement, deuxième onglet, réponse perdue) : rien ne change
      if (lastMergeId === mergeId) return { lines: before, result: null };
      const cart = Cart.restore(before);
      const result = change(cart);
      const lines = await this.save(cartId, before, cart.items, now);
      await this.tx.db.cart.update({ where: { id: cartId }, data: { lastMergeId: mergeId } });
      return { lines, result };
    });
  }

  async removeVariants(accountId: string, variantIds: readonly string[]): Promise<void> {
    await this.prisma.cartItem.deleteMany({
      where: { cart: { accountId }, variantId: { in: [...variantIds] } },
    });
  }

  async purgeInactive(before: Date): Promise<number> {
    const { count } = await this.prisma.cart.deleteMany({ where: { updatedAt: { lt: before } } });
    return count;
  }

  /** Ouvre la transaction, crée ou verrouille le panier, relit ses lignes, puis exécute `work`. */
  private async locked<R>(
    accountId: string,
    now: Date,
    work: (cartId: string, before: CartLine[], lastMergeId: string | null) => Promise<R>,
  ): Promise<R> {
    try {
      return await this.tx.run(async () => {
        const db = this.tx.db;
        await db.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
        // Crée le panier ou note son activité ; dans les deux cas, la ligne reste verrouillée jusqu'à la fin de la transaction
        const [row] = await db.$queryRaw<{ id: string; last_merge_id: string | null }[]>`
          INSERT INTO "orders"."carts" ("id", "account_id", "created_at", "updated_at")
          VALUES (${randomUUID()}::uuid, ${accountId}::uuid, ${now}, ${now})
          ON CONFLICT ("account_id") DO UPDATE SET "updated_at" = EXCLUDED."updated_at"
          RETURNING "id", "last_merge_id"`;
        const before = await db.cartItem.findMany({
          where: { cartId: row!.id },
          select: { variantId: true, quantity: true },
          orderBy: [{ addedAt: "asc" }, { variantId: "asc" }],
        });
        return work(row!.id, before, row!.last_merge_id);
      });
    } catch (error) {
      const code = postgresCode(error);
      if (code === "55P03") throw busyError();
      // Déclencheur des 50 lignes : n'arrive que si le code se trompait (le domaine refuse avant)
      if (code === "23514") {
        throw new OrdersError("PANIER_PLEIN", "votre panier contient déjà 50 produits différents");
      }
      throw error;
    }
  }

  /** Écrit la différence entre les lignes lues et les lignes voulues ; renvoie les lignes voulues. */
  private async save(
    cartId: string,
    before: readonly CartLine[],
    after: CartLine[],
    now: Date,
  ): Promise<CartLine[]> {
    const db = this.tx.db;
    const previous = new Map(before.map((l) => [l.variantId, l.quantity]));
    const kept = new Set(after.map((l) => l.variantId));
    const removed = before.filter((l) => !kept.has(l.variantId)).map((l) => l.variantId);
    // Les suppressions d'abord : la limite de 50 lignes est comptée après chaque ajout
    if (removed.length) {
      await db.cartItem.deleteMany({ where: { cartId, variantId: { in: removed } } });
    }
    let order = 0;
    for (const line of after) {
      order++;
      const old = previous.get(line.variantId);
      if (old === line.quantity) continue;
      if (old === undefined) {
        // Date d'ajout croissante (à la milliseconde) : l'ordre du panier est conservé, même pour une réunion
        await db.cartItem.create({
          data: {
            cartId,
            variantId: line.variantId,
            quantity: line.quantity,
            addedAt: new Date(now.getTime() + order),
          },
        });
      } else {
        await db.cartItem.update({
          where: { cartId_variantId: { cartId, variantId: line.variantId } },
          data: { quantity: line.quantity },
        });
      }
    }
    return after;
  }
}
