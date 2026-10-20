import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type {
  ListingCursor,
  ListingRecord,
  ListingRepository,
  ListingVariantRecord,
  SellerDirectory,
} from "../application/ports.js";
import type { Seller } from "../domain/listing.js";
import type { ProductStatus } from "../domain/product.js";

const withVariants = {
  variants: { orderBy: [{ position: "asc" }, { id: "asc" }] },
} satisfies Prisma.ListingInclude;

type Row = Prisma.ListingGetPayload<{ include: typeof withVariants }>;

function toRecord(row: Row): ListingRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    brand: row.brand,
    categoryId: row.categoryId,
    images: row.images,
    status: row.status,
    createdByShopId: row.createdByShopId,
    mergedIntoId: row.mergedIntoId,
    offerCount: row.offerCount,
    price: row.price,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    variants: row.variants.map((v) => ({
      id: v.id,
      name: v.name,
      attributes: isStringRecord(v.attributes) ? v.attributes : {},
      position: v.position,
    })),
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

const matching = (terms: readonly string[]): Prisma.ListingWhereInput =>
  // Les mots ne contiennent que [a-z0-9] (searchable) : aucun joker SQL possible
  terms.length ? { AND: terms.map((term) => ({ searchText: { contains: term } })) } : {};

/**
 * Fiches communes (S7.5-T02, ADR-0049), pour les vendeurs (recherche d'une fiche existante) et l'équipe (correction,
 * fusion). Les écritures rejoignent la transaction en cours, ouverte par le module vendors avec le journal d'audit.
 */
@Injectable()
export class PrismaListingRepository implements ListingRepository, SellerDirectory {
  constructor(private readonly tx: TransactionContext) {}

  async findById(id: string): Promise<ListingRecord | null> {
    const row = await this.tx.db.listing.findUnique({ where: { id }, include: withVariants });
    return row ? toRecord(row) : null;
  }

  async lockById(id: string): Promise<ListingRecord | null> {
    // La fiche PUIS ses offres, dans l'ordre des identifiants : comme la modération et la réservation de stock
    const rows = await this.tx.db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "catalog"."listings" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!rows[0]) return null;
    await this.tx.db.$executeRaw`
      SELECT 1 FROM "catalog"."products" WHERE "listing_id" = ${id}::uuid ORDER BY "id" FOR UPDATE`;
    return this.findById(id);
  }

  async searchPublished(terms: readonly string[], limit: number): Promise<ListingRecord[]> {
    const rows = await this.tx.db.listing.findMany({
      where: { status: "PUBLISHED", mergedIntoId: null, ...matching(terms) },
      // Les plus vendues (offres) d'abord : la bonne fiche est en général la plus utilisée
      orderBy: [{ offerCount: "desc" }, { reviewCount: "desc" }, { id: "asc" }],
      take: limit,
      include: withVariants,
    });
    return rows.map(toRecord);
  }

  async list(query: {
    terms: readonly string[];
    status?: ProductStatus | undefined;
    limit: number;
    after?: ListingCursor | undefined;
  }): Promise<{ items: ListingRecord[]; next: ListingCursor | null }> {
    const rows = await this.tx.db.listing.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...matching(query.terms),
        ...(query.after
          ? {
              OR: [
                { createdAt: { lt: query.after.at } },
                { createdAt: query.after.at, id: { lt: query.after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: withVariants,
    });
    const items = rows.slice(0, query.limit).map(toRecord);
    const last = rows[query.limit - 1];
    return {
      items,
      next: rows.length > query.limit && last ? { at: last.createdAt, id: last.id } : null,
    };
  }

  async updateContent(listing: ListingRecord, searchText: string, now: Date): Promise<void> {
    await this.tx.db.listing.update({
      where: { id: listing.id },
      data: {
        title: listing.title,
        description: listing.description,
        brand: listing.brand,
        categoryId: listing.categoryId,
        images: [...listing.images],
        searchText,
        updatedAt: now,
      },
    });
  }

  async saveVariant(listingId: string, variant: ListingVariantRecord, now: Date): Promise<void> {
    const data = {
      name: variant.name,
      attributes: { ...variant.attributes },
      position: variant.position,
      updatedAt: now,
    };
    await this.tx.db.listingVariant.upsert({
      where: { id: variant.id },
      create: { id: variant.id, listingId, ...data },
      update: data,
    });
  }

  async merge(
    sourceId: string,
    targetId: string,
    variantMap: ReadonlyMap<string, string>,
    now: Date,
  ): Promise<void> {
    if (!this.tx.active) throw new Error("fusion de fiches hors transaction");
    const db = this.tx.db;
    // 1. Les offres changent de fiche (la base recopie le contenu de la cible)…
    await db.product.updateMany({ where: { listingId: sourceId }, data: { listingId: targetId } });
    // 2. … puis chaque variante passe sur sa déclinaison de la cible (nom recopié, appartenance vérifiée par la base)
    for (const [from, to] of variantMap) {
      await db.productVariant.updateMany({
        where: { listingVariantId: from },
        data: { listingVariantId: to, updatedAt: now },
      });
    }
    // 3. Les propositions de correction encore ouvertes suivent leurs offres (relecture S7.5-T03)
    await db.listingCorrection.updateMany({
      where: { listingId: sourceId, closedAt: null },
      data: { listingId: targetId },
    });
    // 4. Le doublon est archivé ; son adresse mène à la cible
    await db.listing.update({
      where: { id: sourceId },
      data: { status: "ARCHIVED", mergedIntoId: targetId, offerCount: 0, updatedAt: now },
    });
  }

  async save(shopId: string, seller: Seller): Promise<void> {
    await this.tx.db.seller.upsert({
      where: { shopId },
      create: { shopId, ...seller },
      update: seller,
    });
  }
}
