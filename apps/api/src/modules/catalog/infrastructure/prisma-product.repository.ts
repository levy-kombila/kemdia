import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { Product } from "../domain/product.js";
import type {
  Facets,
  Page,
  PriceRange,
  ProductCriteria,
  ProductRepository,
  ProductSummary,
  SortKey,
} from "../application/ports.js";

const ORDER: Record<SortKey, Prisma.ProductOrderByWithRelationInput[]> = {
  pertinence: [{ isFeatured: "desc" }, { reviewCount: "desc" }],
  nouveautes: [{ isNew: "desc" }, { createdAt: "desc" }],
  "prix-asc": [{ price: "asc" }],
  "prix-desc": [{ price: "desc" }],
  note: [{ rating: "desc" }, { reviewCount: "desc" }],
};

const AVAILABLE_VARIANT = {
  isActive: true,
  stock: { gt: 0 },
} satisfies Prisma.ProductVariantWhereInput;

const productWithVariants = {
  variants: { orderBy: [{ position: "asc" }, { price: "asc" }] },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productWithVariants }>;

@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({
      where: { slug },
      include: productWithVariants,
    });
    return row ? toDomain(row) : null;
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
  ): Promise<Page<ProductSummary>> {
    const where = whereOf(criteria);
    const total = await this.prisma.product.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(page, totalPages);
    const rows = await this.prisma.product.findMany({
      where,
      // L'identifiant départage les égalités : une même page renvoie toujours les mêmes produits
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
        price: true,
        compareAtPrice: true,
        rating: true,
        reviewCount: true,
        isFeatured: true,
        isBestseller: true,
        isNew: true,
        variants: { where: AVAILABLE_VARIANT, select: { id: true }, take: 1 },
      },
    });
    return {
      items: rows.map(({ variants, images, ...row }) => ({
        ...row,
        image: images[0] ?? null,
        inStock: variants.length > 0,
      })),
      page: current,
      pageSize,
      total,
      totalPages,
    };
  }

  async facets(criteria: ProductCriteria, priceRanges: readonly PriceRange[]): Promise<Facets> {
    const where = whereOf(criteria);
    const and = (extra: Prisma.ProductWhereInput): Prisma.ProductWhereInput => ({
      AND: [where, extra],
    });
    const [brands, inStock, deals, rating4, ...prices] = await this.prisma.$transaction([
      this.prisma.product.groupBy({
        by: ["brand"],
        where: and({ brand: { not: null } }),
        _count: { _all: true },
        orderBy: { brand: "asc" },
      }),
      this.prisma.product.count({ where: and({ variants: { some: AVAILABLE_VARIANT } }) }),
      this.prisma.product.count({ where: and({ compareAtPrice: { not: null } }) }),
      this.prisma.product.count({ where: and({ rating: { gte: 4 } }) }),
      ...priceRanges.map((range) =>
        this.prisma.product.count({ where: and({ price: { gte: range.min, lte: range.max } }) }),
      ),
    ]);
    return {
      brands: brands
        .map((b) => ({ name: b.brand as string, count: (b._count as { _all: number })._all }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr")),
      prices: priceRanges.map((range, i) => ({ key: range.key, count: prices[i] as number })),
      inStock,
      deals,
      rating4,
    };
  }

  async save(product: Product, searchText: string): Promise<void> {
    const data = {
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
    const variantIds = product.variants.map((v) => v.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.product.upsert({
        where: { id: product.id },
        create: { id: product.id, ...data },
        update: data,
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
          create: { id: v.id, productId: product.id, ...variant },
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
}

function whereOf(c: ProductCriteria): Prisma.ProductWhereInput {
  return {
    status: "PUBLISHED",
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
    ...(c.inStock ? { variants: { some: AVAILABLE_VARIANT } } : {}),
    // Le prix barré est toujours supérieur au prix (contrainte SQL) : « en promotion » = prix barré présent
    ...(c.onlyDeals ? { compareAtPrice: { not: null } } : {}),
    ...(c.minRating !== undefined ? { rating: { gte: c.minRating } } : {}),
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
    variants: row.variants.map((v) => ({
      id: v.id,
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
