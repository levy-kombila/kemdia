import { Injectable } from "@nestjs/common";
import { KEMDIA_SHOP_ID } from "@kemdia/contracts/constants";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type {
  DerivedFields,
  InsertOutcome,
  VendorProductCursor,
  VendorProductRecord,
  VendorProductRepository,
  VendorVariantRecord,
} from "../application/ports.js";
import type { ProductStatus } from "../domain/product.js";

const withVariants = {
  variants: { orderBy: [{ position: "asc" }, { id: "asc" }] },
  listing: {
    select: {
      slug: true,
      status: true,
      createdByShopId: true,
      variants: { orderBy: [{ position: "asc" }, { id: "asc" }] },
    },
  },
} satisfies Prisma.ProductInclude;

type Row = Prisma.ProductGetPayload<{ include: typeof withVariants }>;

function toRecord(row: Row): VendorProductRecord {
  return {
    id: row.id,
    shopId: row.shopId,
    listingId: row.listingId,
    listingSlug: row.listing.slug,
    listingStatus: row.listing.status,
    listingOwnerShopId: row.listing.createdByShopId,
    listingVariants: row.listing.variants.map((v) => ({
      id: v.id,
      name: v.name,
      attributes: isStringRecord(v.attributes) ? v.attributes : {},
    })),
    slug: row.slug,
    title: row.title,
    description: row.description,
    brand: row.brand,
    categoryId: row.categoryId,
    images: row.images,
    status: row.status,
    moderationReason: row.moderationReason,
    submittedAt: row.submittedAt,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    shopSuspended: row.shopSuspended,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    variants: row.variants.map((v) => ({
      id: v.id,
      listingVariantId: v.listingVariantId,
      sku: v.sku,
      name: v.name,
      attributes: isStringRecord(v.attributes) ? v.attributes : {},
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      stock: v.stock,
      isActive: v.isActive,
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

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } })
    ?.meta;
  return code === "P2002" || meta?.driverAdapterError?.cause?.originalCode === "23505";
}

/** Index unique en cause (nom de la contrainte ou colonnes), tel que Prisma ou le pilote le rapportent. */
function violatesImportReference(error: unknown): boolean {
  return /import_reference|importReference/.test(JSON.stringify(error ?? null) + String(error));
}

/**
 * Contenu d'une fiche créée par la boutique et pas encore publiée : le vendeur l'écrit (S7.5-T02). La base le recopie
 * sur l'offre ; une fois la fiche publiée, seule l'équipe le change.
 */
function content(record: VendorProductRecord, derived: DerivedFields) {
  return {
    title: record.title,
    description: record.description,
    brand: record.brand,
    categoryId: record.categoryId,
    // Photos du vendeur (S6-T04) : leur ordre et leurs adresses
    images: [...record.images],
    searchText: derived.searchText,
  };
}

/** La boutique écrit-elle le contenu de la fiche ? Seulement la sienne, avant sa publication. */
function writesListing(record: VendorProductRecord): boolean {
  return record.listingOwnerShopId === record.shopId && record.listingStatus !== "PUBLISHED";
}

/**
 * Champs de l'offre qu'un vendeur ou la modération peut changer (jamais la boutique, la fiche, l'adresse, les notes ni
 * les badges). Le contenu affiché vient de la fiche (copié par la base).
 */
function mutable(record: VendorProductRecord, derived: DerivedFields) {
  return {
    status: record.status,
    moderationReason: record.moderationReason,
    submittedAt: record.submittedAt,
    reviewedBy: record.reviewedBy,
    reviewedAt: record.reviewedAt,
    price: derived.price,
    compareAtPrice: derived.compareAtPrice,
    updatedAt: record.updatedAt,
  };
}

function page(rows: Row[], limit: number, at: (row: Row) => Date | null) {
  const items = rows.slice(0, limit).map(toRecord);
  const last = rows[limit - 1];
  return {
    items,
    next: rows.length > limit && last ? { at: at(last) ?? last.createdAt, id: last.id } : null,
  };
}

/**
 * Produits des vendeurs (schéma `catalog`, S6-T02). Les écritures rejoignent la transaction en cours, ouverte par le
 * module vendors : produit, boutique et journal d'audit sont écrits ensemble ou pas du tout. Les contraintes SQL de la
 * migration doublent les règles du domaine (motif ⇔ refus, boutique Kemdia jamais modérée…).
 */
@Injectable()
export class PrismaVendorProductRepository implements VendorProductRepository {
  constructor(private readonly tx: TransactionContext) {}

  async findById(id: string): Promise<VendorProductRecord | null> {
    const row = await this.tx.db.product.findUnique({ where: { id }, include: withVariants });
    return row ? toRecord(row) : null;
  }

  async lockById(id: string): Promise<VendorProductRecord | null> {
    // La FICHE, puis l'offre, puis ses variantes, dans cet ordre partout (relecture S7.5-T02) : l'équipe verrouille
    // aussi la fiche avant ses offres (correction, fusion), et l'écriture de l'offre met à jour la fiche (déclencheur).
    // Une réservation de stock verrouille la variante seule ; elle attend la fin de la modification, ou l'inverse.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const offer = await this.tx.db.$queryRaw<{ listing_id: string }[]>`
        SELECT "listing_id" FROM "catalog"."products" WHERE "id" = ${id}::uuid`;
      if (!offer[0]) return null;
      await this.tx.db.$executeRaw`
        SELECT 1 FROM "catalog"."listings" WHERE "id" = ${offer[0].listing_id}::uuid FOR UPDATE`;
      const rows = await this.tx.db.$queryRaw<{ listing_id: string }[]>`
        SELECT "listing_id" FROM "catalog"."products" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!rows[0]) return null;
      // Déplacée par une fusion entre les deux lectures : recommencer avec sa nouvelle fiche
      if (rows[0].listing_id !== offer[0].listing_id) continue;
      await this.tx.db.$executeRaw`
        SELECT 1 FROM "catalog"."product_variants" WHERE "product_id" = ${id}::uuid ORDER BY "id" FOR UPDATE`;
      return this.findById(id);
    }
    throw new Error("offre déplacée pendant son verrouillage");
  }

  async importedReferences(shopId: string, references: readonly string[]): Promise<Set<string>> {
    if (references.length === 0) return new Set();
    const rows = await this.tx.db.$queryRaw<{ ref: string }[]>`
      SELECT lower("import_reference") AS ref FROM "catalog"."products"
      WHERE "shop_id" = ${shopId}::uuid AND lower("import_reference") = ANY(${references.map((r) => r.toLowerCase())}::text[])`;
    return new Set(rows.map((r) => r.ref));
  }

  async insert(
    record: VendorProductRecord,
    derived: DerivedFields,
    importReference: string | null = null,
  ): Promise<InsertOutcome> {
    if (!this.tx.active) throw new Error("création d'un produit de vendeur hors transaction");
    const db = this.tx.db;
    try {
      // Point de sauvegarde : une adresse déjà prise annule seulement cet essai, pas la transaction de l'appelant
      await db.$executeRawUnsafe("SAVEPOINT vendor_product_insert");
      if (record.listingId === record.id) {
        // Nouvelle fiche, créée avec l'offre : même identifiant, même adresse, une déclinaison par variante
        await db.listing.create({
          data: {
            id: record.id,
            slug: record.slug,
            status: record.status,
            createdByShopId: record.shopId,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            ...content(record, derived),
            variants: {
              create: record.variants.map((v, position) => ({
                id: v.listingVariantId,
                name: v.name,
                attributes: { ...v.attributes },
                position,
              })),
            },
          },
        });
      }
      await db.product.create({
        data: {
          id: record.id,
          shopId: record.shopId,
          listingId: record.listingId,
          slug: record.slug,
          importReference,
          createdAt: record.createdAt,
          // Recopiés de la fiche par la base ; présents ici parce que les colonnes sont obligatoires
          ...content(record, derived),
          ...mutable(record, derived),
          variants: {
            create: record.variants.map((v, position) => ({
              id: v.id,
              listingVariantId: v.listingVariantId,
              sku: v.sku,
              name: v.name,
              attributes: { ...v.attributes },
              price: v.price,
              compareAtPrice: v.compareAtPrice,
              stock: v.stock,
              isActive: v.isActive,
              position,
            })),
          },
        },
      });
      await db.$executeRawUnsafe("RELEASE SAVEPOINT vendor_product_insert");
      return "inserted";
    } catch (error) {
      if (isUniqueViolation(error)) {
        await db.$executeRawUnsafe("ROLLBACK TO SAVEPOINT vendor_product_insert");
        // Référence d'import déjà prise : un nouvel essai n'y changerait rien (relecture S8-T03)
        return importReference !== null && violatesImportReference(error)
          ? "import_reference_taken"
          : "slug_taken";
      }
      throw error;
    }
  }

  async update(record: VendorProductRecord, derived: DerivedFields): Promise<void> {
    const db = this.tx.db;
    // La fiche d'abord : l'offre recopie son contenu (base), puis la fiche suit le statut de l'offre tant qu'elle
    // n'est pas publiée (déclencheur)
    if (writesListing(record)) {
      await db.listing.update({
        where: { id: record.listingId },
        data: { ...content(record, derived), updatedAt: record.updatedAt },
      });
    }
    await db.product.update({ where: { id: record.id }, data: mutable(record, derived) });
    for (const v of record.variants) {
      await db.productVariant.update({
        where: { id: v.id },
        data: {
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stock: v.stock,
          isActive: v.isActive,
          updatedAt: record.updatedAt,
        },
      });
    }
  }

  async insertVariant(
    productId: string,
    variant: VendorVariantRecord,
    position: number,
  ): Promise<void> {
    await this.tx.db.productVariant.create({
      data: {
        id: variant.id,
        productId,
        listingVariantId: variant.listingVariantId,
        sku: variant.sku,
        // Nom et caractéristiques recopiés de la déclinaison par la base
        name: variant.name,
        attributes: { ...variant.attributes },
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        stock: variant.stock,
        isActive: variant.isActive,
        position,
      },
    });
  }

  async findOffer(listingId: string, shopId: string): Promise<VendorProductRecord | null> {
    const row = await this.tx.db.product.findUnique({
      where: { listingId_shopId: { listingId, shopId } },
      include: withVariants,
    });
    return row ? toRecord(row) : null;
  }

  async listForListing(listingId: string): Promise<VendorProductRecord[]> {
    const rows = await this.tx.db.product.findMany({
      where: { listingId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: withVariants,
    });
    return rows.map(toRecord);
  }

  async listForShop(
    shopId: string,
    query: {
      status?: ProductStatus | undefined;
      limit: number;
      after?: VendorProductCursor | undefined;
    },
  ) {
    const rows = await this.tx.db.product.findMany({
      where: {
        shopId,
        ...(query.status ? { status: query.status } : {}),
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
    return page(rows, query.limit, (row) => row.createdAt);
  }

  async moderationQueue(query: {
    status: ProductStatus;
    limit: number;
    after?: VendorProductCursor | undefined;
  }) {
    const rows = await this.tx.db.product.findMany({
      where: {
        status: query.status,
        shopId: { not: KEMDIA_SHOP_ID },
        submittedAt: { not: null },
        ...(query.after
          ? {
              OR: [
                { submittedAt: { gt: query.after.at } },
                { submittedAt: query.after.at, id: { gt: query.after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      include: withVariants,
    });
    return page(rows, query.limit, (row) => row.submittedAt);
  }

  countPending(shopId: string): Promise<number> {
    return this.tx.db.product.count({ where: { shopId, status: "PENDING" } });
  }

  async setShopSuspended(shopId: string, suspended: boolean): Promise<number> {
    if (shopId === KEMDIA_SHOP_ID) return 0;
    // Les fiches de ses offres d'abord (S7.5-T02 : même ordre que l'équipe et les vendeurs), puis les offres, dans
    // l'ordre des identifiants comme la réservation de stock : pas d'interblocage
    await this.tx.db.$executeRaw`
      SELECT 1 FROM "catalog"."listings"
      WHERE "id" IN (SELECT "listing_id" FROM "catalog"."products" WHERE "shop_id" = ${shopId}::uuid)
      ORDER BY "id" FOR UPDATE`;
    await this.tx.db.$executeRaw`
      SELECT 1 FROM "catalog"."products" WHERE "shop_id" = ${shopId}::uuid ORDER BY "id" FOR UPDATE`;
    const { count } = await this.tx.db.product.updateMany({
      where: { shopId, shopSuspended: !suspended },
      data: { shopSuspended: suspended },
    });
    return count;
  }
}
