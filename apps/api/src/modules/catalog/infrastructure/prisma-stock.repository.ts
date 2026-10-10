import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { ReservedVariant, StockLine, StockRepository } from "../application/ports.js";

type Row = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  title: string;
  image: string | null;
  active_count: number;
};

/**
 * Réservation du stock (S5-T02, BR-012). Chaque ligne est UNE mise à jour conditionnelle : elle ne réussit que si le
 * stock suffit, le produit est publié et la variante active — la ligne de la variante reste verrouillée jusqu'à la fin
 * de la transaction de la commande. Deux commandes simultanées ne peuvent donc pas vendre le même dernier article.
 */
@Injectable()
export class PrismaStockRepository implements StockRepository {
  constructor(private readonly tx: TransactionContext) {}

  async reserve(
    lines: readonly StockLine[],
  ): Promise<{ reserved: ReservedVariant[]; failed: string[] }> {
    // Hors transaction, une réservation partielle ne pourrait pas être annulée : refus net
    if (!this.tx.active) throw new Error("réservation du stock hors transaction");
    const db = this.tx.db;
    const reserved: ReservedVariant[] = [];
    for (const { variantId, quantity } of lines) {
      const rows = await db.$queryRaw<Row[]>`
        UPDATE "catalog"."product_variants" AS v
        SET "stock" = v."stock" - ${quantity}, "updated_at" = now()
        FROM "catalog"."products" AS p
        WHERE v."id" = ${variantId}::uuid
          AND p."id" = v."product_id"
          AND p."status" = 'PUBLISHED'
          AND v."is_active"
          AND v."stock" >= ${quantity}
        RETURNING v."id", v."product_id", v."name", v."price", p."title", p."images"[1] AS "image",
          (SELECT count(*) FROM "catalog"."product_variants" AS w
            WHERE w."product_id" = v."product_id" AND w."is_active")::int AS "active_count"`;
      const row = rows[0];
      if (!row) return { reserved, failed: [variantId] };
      reserved.push({
        variantId: row.id,
        productId: row.product_id,
        title: row.title,
        variantName: row.active_count > 1 ? row.name : "",
        image: row.image,
        price: row.price,
        quantity,
      });
    }
    return { reserved, failed: [] };
  }

  async release(lines: readonly StockLine[]): Promise<void> {
    const db = this.tx.db;
    for (const { variantId, quantity } of lines) {
      await db.$executeRaw`
        UPDATE "catalog"."product_variants"
        SET "stock" = "stock" + ${quantity}, "updated_at" = now()
        WHERE "id" = ${variantId}::uuid`;
    }
  }
}
