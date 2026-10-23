import { Injectable } from "@nestjs/common";
import { KEMDIA_SHOP_ID } from "@kemdia/contracts/constants";
import { PrismaService } from "../../../database/prisma.service.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { pickOffer, type OfferCandidate, type Seller } from "../domain/listing.js";
import { Product } from "../domain/product.js";
import type {
  Badge,
  Facets,
  ListingSnapshot,
  Page,
  PriceRange,
  ProductCriteria,
  ProductRepository,
  ProductSummary,
  SortKey,
} from "../application/ports.js";

const ORDER: Record<SortKey, Prisma.ListingOrderByWithRelationInput[]> = {
  pertinence: [{ isFeatured: "desc" }, { reviewCount: "desc" }],
  nouveautes: [{ isNew: "desc" }, { createdAt: "desc" }],
  "prix-asc": [{ price: "asc" }],
  "prix-desc": [{ price: "desc" }],
  note: [{ rating: "desc" }, { reviewCount: "desc" }],
  // « Les plus demandés » : nombre d'avis, en attendant les ventes réelles (module orders, S5)
  ventes: [{ reviewCount: "desc" }, { rating: "desc" }],
};

const BADGE_FILTERS: Record<Badge, Prisma.ListingWhereInput> = {
  featured: { isFeatured: true },
  new: { isNew: true },
  bestseller: { isBestseller: true },
};

const AVAILABLE_VARIANT = {
  isActive: true,
  stock: { gt: 0 },
} satisfies Prisma.ProductVariantWhereInput;

/** Offre visible : publiée, boutique non suspendue (la fiche publiée est vérifiée à part). */
const VISIBLE_OFFER = {
  status: "PUBLISHED",
  shopSuspended: false,
} satisfies Prisma.ProductWhereInput;

const productWithVariants = {
  variants: { orderBy: [{ position: "asc" }, { price: "asc" }] },
  listing: { select: { slug: true, status: true } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productWithVariants }>;

@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findListingBySlug(slug: string): Promise<ListingSnapshot | null> {
    const row = await this.prisma.listing.findUnique({
      where: { slug },
      include: {
        variants: { orderBy: [{ position: "asc" }, { id: "asc" }] },
        mergedInto: { select: { slug: true } },
        offers: { include: productWithVariants, orderBy: { id: "asc" } },
      },
    });
    if (!row) return null;
    return {
      content: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        brand: row.brand,
        categoryId: row.categoryId,
        images: row.images,
        rating: row.rating,
        reviewCount: row.reviewCount,
        isFeatured: row.isFeatured,
        isBestseller: row.isBestseller,
        isNew: row.isNew,
      },
      status: row.status,
      mergedIntoSlug: row.mergedInto?.slug ?? null,
      variants: row.variants.map((v) => ({
        id: v.id,
        name: v.name,
        attributes: isStringRecord(v.attributes) ? v.attributes : {},
      })),
      offers: row.offers.map(toDomain),
      sellers: await this.sellers(row.offers.map((o) => o.shopId)),
    };
  }

  async findByVariantIds(variantIds: readonly string[]): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      where: { variants: { some: { id: { in: [...variantIds] } } } },
      include: productWithVariants,
    });
    return rows.map(toDomain);
  }

  async search(
    criteria: ProductCriteria,
    sort: SortKey,
    page: number,
    pageSize: number,
    city?: string | null,
  ): Promise<Page<ProductSummary>> {
    const where = whereOf(criteria);
    const total = await this.prisma.listing.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(page, totalPages);
    const rows = await this.prisma.listing.findMany({
      where,
      // L'identifiant départage les égalités : une même page renvoie toujours les mêmes fiches
      orderBy: [...ORDER[sort], { id: "asc" }],
      skip: (current - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        title: true,
        brand: true,
        categoryId: true,
        images: true,
        offerCount: true,
        rating: true,
        reviewCount: true,
        isFeatured: true,
        isBestseller: true,
        isNew: true,
      },
    });
    // Offres visibles des fiches de la page, en une requête : l'offre mise en avant de chaque carte. Page d'une
    // boutique (S7.5-T07) : seulement SON offre (son prix, son stock).
    const offers = rows.length
      ? await this.prisma.product.findMany({
          where: {
            listingId: { in: rows.map((r) => r.id) },
            ...VISIBLE_OFFER,
            ...(criteria.shopId ? { shopId: criteria.shopId } : {}),
          },
          include: {
            ...productWithVariants,
            variants: { where: { isActive: true }, orderBy: [{ position: "asc" }, { id: "asc" }] },
          },
        })
      : [];
    const sellers = await this.sellers(offers.map((o) => o.shopId));
    const byListing = new Map<string, OfferCandidate[]>();
    for (const row of offers) {
      const offer = toDomain(row);
      for (const variant of offer.variants) {
        const list = byListing.get(offer.listingId) ?? [];
        list.push({ offer, variant, seller: sellers.get(offer.shopId) ?? null });
        byListing.set(offer.listingId, list);
      }
    }
    const items: ProductSummary[] = [];
    for (const { images, ...row } of rows) {
      const candidates = byListing.get(row.id) ?? [];
      const main = pickOffer(candidates, city);
      // Compteur de la base en retard d'une écriture (offre retirée à l'instant) : la carte attend le prochain appel
      if (!main) continue;
      items.push({
        ...row,
        image: images[0] ?? null,
        price: main.variant.price,
        compareAtPrice: main.variant.compareAtPrice,
        inStock: main.variant.stock > 0,
        variantId: main.variant.id,
        stock: main.variant.stock,
        variantCount: new Set(candidates.map((c) => c.variant.listingVariantId)).size,
      });
    }
    return { items, page: current, pageSize, total, totalPages };
  }

  count(criteria: ProductCriteria): Promise<number> {
    return this.prisma.listing.count({ where: whereOf(criteria) });
  }

  /**
   * Recherche approchée (S7.5-T06, ADR-0053), en une seule requête (une seule connexion, relecture de sécurité) :
   * pour chaque mot, présence exacte dans une fiche visible, puis fiches visibles dont le texte contient un mot qui
   * RESSEMBLE au mot tapé (opérateur `<%` de pg_trgm, servi par l'index trigrammes) et les mots de ces fiches classés
   * par ressemblance. Seuil abaissé à 0,3 pour cette seule transaction (`set_config(…, true)`) : une inversion de
   * lettres (« ipohne ») casse beaucoup de trigrammes. Le choix final (distance d'édition) est fait par le domaine.
   * Requête paramétrée : les mots (déjà réduits à [a-z0-9] par `searchable`) ne sont jamais concaténés au SQL.
   */
  async similarWords(
    terms: readonly string[],
    limit: number,
  ): Promise<Map<string, { present: boolean; words: string[] }>> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.3', true)`;
      return tx.$queryRaw<{ term: string; present: boolean; words: string[] | null }[]>`
        SELECT q.term,
          EXISTS (
            SELECT 1 FROM catalog.listings l
            WHERE l.status = 'PUBLISHED' AND l.merged_into_id IS NULL AND l.offer_count > 0
              AND strpos(l.search_text, q.term) > 0
          ) AS present,
          (
            SELECT array_agg(r.word ORDER BY r.score DESC, r.word)
            FROM (
              SELECT w.word, max(similarity(w.word, q.term)) AS score
              FROM (
                SELECT l.search_text
                FROM catalog.listings l
                WHERE length(q.term) BETWEEN 3 AND 30
                  AND l.status = 'PUBLISHED' AND l.merged_into_id IS NULL AND l.offer_count > 0
                  AND q.term <% l.search_text
                ORDER BY word_similarity(q.term, l.search_text) DESC, l.id
                LIMIT 50
              ) t
              CROSS JOIN LATERAL unnest(string_to_array(t.search_text, ' ')) AS w(word)
              WHERE length(w.word) BETWEEN 2 AND 30
              GROUP BY w.word
              ORDER BY score DESC, w.word
              LIMIT ${limit}
            ) r
          ) AS words
        FROM unnest(${[...terms]}::text[]) AS q(term)`;
    });
    return new Map(rows.map((r) => [r.term, { present: r.present, words: r.words ?? [] }]));
  }

  async brands(criteria: ProductCriteria, limit: number): Promise<string[]> {
    const rows = await this.prisma.listing.groupBy({
      by: ["brand"],
      where: { AND: [whereOf(criteria), { brand: { not: null } }] },
      _count: { _all: true },
      orderBy: [{ _count: { brand: "desc" } }, { brand: "asc" }],
      take: limit,
    });
    return rows.flatMap((r) => (r.brand ? [r.brand] : []));
  }

  async facets(criteria: ProductCriteria, priceRanges: readonly PriceRange[]): Promise<Facets> {
    const where = whereOf(criteria);
    const and = (extra: Prisma.ListingWhereInput): Prisma.ListingWhereInput => ({
      AND: [where, extra],
    });
    const [brands, inStock, deals, rating4, ...prices] = await this.prisma.$transaction([
      this.prisma.listing.groupBy({
        by: ["brand"],
        where: and({ brand: { not: null } }),
        _count: { _all: true },
        orderBy: { brand: "asc" },
      }),
      this.prisma.listing.count({
        where: and(
          criteria.shopId
            ? {
                offers: {
                  some: {
                    ...VISIBLE_OFFER,
                    shopId: criteria.shopId,
                    variants: { some: AVAILABLE_VARIANT },
                  },
                },
              }
            : IN_STOCK,
        ),
      }),
      this.prisma.listing.count({ where: and({ compareAtPrice: { not: null } }) }),
      this.prisma.listing.count({ where: and({ rating: { gte: 4 } }) }),
      ...priceRanges.map((range) =>
        this.prisma.listing.count({ where: and({ price: { gte: range.min, lte: range.max } }) }),
      ),
    ]);
    return {
      brands: brands
        .map((b) => ({ name: b.brand as string, count: b._count._all }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr")),
      prices: priceRanges.map((range, i) => ({ key: range.key, count: prices[i] as number })),
      inStock,
      deals,
      rating4,
    };
  }

  async save(product: Product, searchText: string): Promise<void> {
    const shopId = product.shopId || KEMDIA_SHOP_ID;
    const content = {
      slug: product.slug,
      title: product.title,
      description: product.description,
      brand: product.brand,
      categoryId: product.categoryId,
      images: [...product.images],
      rating: product.rating,
      reviewCount: product.reviewCount,
      isFeatured: product.isFeatured,
      isBestseller: product.isBestseller,
      isNew: product.isNew,
      searchText,
    };
    const variantIds = product.variants.map((v) => v.id);
    await this.prisma.$transaction(async (tx) => {
      // La fiche d'abord (même identifiant) : l'offre et ses variantes copient son contenu (base, S7.5-T02).
      // Une fiche déjà publiée le reste (d'autres boutiques peuvent y vendre).
      const existing = await tx.listing.findUnique({
        where: { id: product.id },
        select: { status: true },
      });
      await tx.listing.upsert({
        where: { id: product.id },
        create: { id: product.id, ...content, status: product.status, createdByShopId: shopId },
        update: {
          ...content,
          ...(existing?.status === "PUBLISHED" ? {} : { status: product.status }),
        },
      });
      for (const [position, v] of product.variants.entries()) {
        const declinaison = { name: v.name, attributes: { ...v.attributes }, position };
        await tx.listingVariant.upsert({
          where: { id: v.id },
          create: { id: v.id, listingId: product.id, ...declinaison },
          update: declinaison,
        });
      }
      const offer = {
        slug: product.slug,
        title: product.title,
        description: product.description,
        brand: product.brand,
        categoryId: product.categoryId,
        images: [...product.images],
        status: product.status,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        rating: product.rating,
        reviewCount: product.reviewCount,
        isFeatured: product.isFeatured,
        isBestseller: product.isBestseller,
        isNew: product.isNew,
        searchText,
      };
      await tx.product.upsert({
        where: { id: product.id },
        create: { id: product.id, listingId: product.id, shopId, ...offer },
        update: offer,
      });
      for (const [position, v] of product.variants.entries()) {
        const variant = {
          sku: v.sku,
          name: v.name,
          attributes: { ...v.attributes },
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stock: v.stock,
          isActive: v.isActive,
          position,
        };
        await tx.productVariant.upsert({
          where: { id: v.id },
          create: { id: v.id, productId: product.id, listingVariantId: v.id, ...variant },
          update: variant,
        });
      }
      // Une variante retirée est désactivée, jamais supprimée : elle peut figurer dans une commande (BR-002)
      await tx.productVariant.updateMany({
        where: { productId: product.id, id: { notIn: variantIds } },
        data: { isActive: false },
      });
    });
  }

  /** Boutiques des offres (nom, adresse, ville), lues dans la copie du catalogue. */
  private async sellers(shopIds: readonly string[]): Promise<Map<string, Seller>> {
    const ids = [...new Set(shopIds)];
    if (!ids.length) return new Map();
    const rows = await this.prisma.seller.findMany({ where: { shopId: { in: ids } } });
    return new Map(rows.map((r) => [r.shopId, { name: r.name, slug: r.slug, city: r.city }]));
  }
}

const IN_STOCK = {
  offers: { some: { ...VISIBLE_OFFER, variants: { some: AVAILABLE_VARIANT } } },
} satisfies Prisma.ListingWhereInput;

function whereOf(c: ProductCriteria): Prisma.ListingWhereInput {
  return {
    // Fiche publiée, non fusionnée, avec au moins une offre visible (publiée, boutique non suspendue)
    status: "PUBLISHED",
    mergedIntoId: null,
    offerCount: { gt: 0 },
    ...(c.categoryIds ? { categoryId: { in: [...c.categoryIds] } } : {}),
    // Les mots ne contiennent que [a-z0-9] (searchable) : aucun joker SQL possible
    ...(c.terms.length ? { AND: c.terms.map((term) => ({ searchText: { contains: term } })) } : {}),
    ...(c.priceMin !== undefined || c.priceMax !== undefined
      ? {
          price: {
            ...(c.priceMin !== undefined ? { gte: c.priceMin } : {}),
            ...(c.priceMax !== undefined ? { lte: c.priceMax } : {}),
          },
        }
      : {}),
    ...(c.brands.length ? { brand: { in: [...c.brands] } } : {}),
    // Page d'une boutique (S7.5-T07) : « en stock » se lit sur SON offre
    ...(c.inStock && !c.shopId ? IN_STOCK : {}),
    // Le prix barré est toujours supérieur au prix (contrainte SQL) : « en promotion » = prix barré présent
    ...(c.onlyDeals ? { compareAtPrice: { not: null } } : {}),
    ...(c.minRating !== undefined ? { rating: { gte: c.minRating } } : {}),
    ...(c.badge ? BADGE_FILTERS[c.badge] : {}),
    ...(c.shopId
      ? {
          offers: {
            some: {
              ...VISIBLE_OFFER,
              shopId: c.shopId,
              ...(c.inStock ? { variants: { some: AVAILABLE_VARIANT } } : {}),
            },
          },
        }
      : {}),
  };
}

function toDomain(row: ProductRow): Product {
  return Product.create({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    brand: row.brand,
    categoryId: row.categoryId,
    images: row.images,
    status: row.status,
    rating: row.rating,
    reviewCount: row.reviewCount,
    isFeatured: row.isFeatured,
    isBestseller: row.isBestseller,
    isNew: row.isNew,
    shopSuspended: row.shopSuspended,
    shopId: row.shopId,
    listingId: row.listingId,
    listingSlug: row.listing.slug,
    listingPublished: row.listing.status === "PUBLISHED",
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
  });
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}
