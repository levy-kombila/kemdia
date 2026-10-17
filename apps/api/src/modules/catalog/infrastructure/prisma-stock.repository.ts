import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { ReservedVariant, StockLine, StockRepository } from "../application/ports.js";

type Row = {
  id: string;
  product_id: string;
  shop_id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
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
    // Produits verrouillés en partage AVANT les variantes, dans l'ordre des identifiants (relecture S6-T02) : une
    // modification, une modération ou une suspension en cours finit d'abord, puis la réservation relit son statut ;
    // un produit caché à l'instant n'est jamais réservé. Même ordre partout : pas d'interblocage.
    const variantIds = lines.map((line) => line.variantId);
    await db.$executeRaw`
      SELECT 1 FROM "catalog"."products"
      WHERE "id" IN (SELECT "product_id" FROM "catalog"."product_variants" WHERE "id" = ANY(${variantIds}::uuid[]))
      ORDER BY "id" FOR SHARE`;
    const reserved: ReservedVariant[] = [];
    for (const { variantId, quantity } of lines) {
      const rows = await db.$queryRaw<Row[]>`
        UPDATE "catalog"."product_variants" AS v
        SET "stock" = v."stock" - ${quantity}, "updated_at" = now()
        FROM "catalog"."products" AS p
        WHERE v."id" = ${variantId}::uuid
          AND p."id" = v."product_id"
          AND p."status" = 'PUBLISHED'
          AND NOT p."shop_suspended"
          AND v."is_active"
          AND v."stock" >= ${quantity}
        RETURNING v."id", v."product_id", p."shop_id", v."name", v."price", v."compare_at_price", p."title", p."images"[1] AS "image",
          (SELECT count(*) FROM "catalog"."product_variants" AS w
            WHERE w."product_id" = v."product_id" AND w."is_active")::int AS "active_count"`;
      const row = rows[0];
      if (!row) return { reserved, failed: [variantId] };
      reserved.push({
        variantId: row.id,
        productId: row.product_id,
        shopId: row.shop_id,
        title: row.title,
        variantName: row.active_count > 1 ? row.name : "",
        image: row.image,
        price: row.price,
        compareAtPrice: row.compare_at_price,
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
