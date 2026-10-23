import type {
  CategoryRepository,
  Facets,
  ListingSnapshot,
  Page,
  PriceRange,
  ProductCriteria,
  ProductRepository,
  ProductSummary,
  SortKey,
} from "../../src/modules/catalog/application/ports.js";
import type { Category } from "../../src/modules/catalog/domain/category.js";
import type { Seller } from "../../src/modules/catalog/domain/listing.js";
import type { Product } from "../../src/modules/catalog/domain/product.js";
import { searchable } from "../../src/modules/catalog/domain/values.js";

/** Dépôts en mémoire : testent l'application sans base de données (le vrai SQL est testé en intégration). */
export class InMemoryCategories implements CategoryRepository {
  calls = 0;
  constructor(public items: Category[] = []) {}
  findAll(): Promise<Category[]> {
    this.calls++;
    return Promise.resolve([...this.items]);
  }
  save(category: Category): Promise<void> {
    this.items = [...this.items.filter((c) => c.id !== category.id), category];
    return Promise.resolve();
  }
}

/**
 * Offres en mémoire, regroupées par fiche (`listingId`) : la fiche reprend le contenu de sa première offre (comme les
 * données d'avant le S7.5, une fiche par produit). `sellers` : boutiques connues ; `mergedInto` : doublons fusionnés.
 */
export class InMemoryProducts implements ProductRepository {
  lastCriteria: ProductCriteria | undefined;
  sellers = new Map<string, Seller>();
  mergedInto = new Map<string, string>();
  constructor(public items: Product[] = []) {}
  findListingBySlug(slug: string): Promise<ListingSnapshot | null> {
    const first = this.items.find((p) => p.listingSlug === slug);
    if (!first) return Promise.resolve(null);
    const offers = this.items.filter((p) => p.listingId === first.listingId);
    const variants = new Map(
      offers.flatMap((o) =>
        o.variants.map(
          (v) =>
            [
              v.listingVariantId,
              { id: v.listingVariantId, name: v.name, attributes: v.attributes },
            ] as const,
        ),
      ),
    );
    return Promise.resolve({
      content: {
        id: first.listingId,
        slug: first.listingSlug,
        title: first.title,
        description: first.description,
        brand: first.brand,
        categoryId: first.categoryId,
        images: first.images,
        rating: first.rating,
        reviewCount: first.reviewCount,
        isFeatured: first.isFeatured,
        isBestseller: first.isBestseller,
        isNew: first.isNew,
      },
      status: first.listingPublished ? "PUBLISHED" : "ARCHIVED",
      mergedIntoSlug: this.mergedInto.get(slug) ?? null,
      variants: [...variants.values()],
      offers,
      sellers: this.sellers,
    });
  }
  findByVariantIds(variantIds: readonly string[]): Promise<Product[]> {
    return Promise.resolve(
      this.items.filter((p) => p.variants.some((v) => variantIds.includes(v.id))),
    );
  }
  search(
    criteria: ProductCriteria,
    _sort: SortKey,
    page: number,
    pageSize: number,
  ): Promise<Page<ProductSummary>> {
    this.lastCriteria = criteria;
    return Promise.resolve({ items: [], page, pageSize, total: 0, totalPages: 1 });
  }
  facets(criteria: ProductCriteria, priceRanges: readonly PriceRange[]): Promise<Facets> {
    this.lastCriteria = criteria;
    return Promise.resolve({
      brands: [],
      prices: priceRanges.map(({ key }) => ({ key, count: 0 })),
      inStock: 0,
      deals: 0,
      rating4: 0,
    });
  }
  /** Texte de recherche simplifié : titre et marque (la catégorie n'est pas connue ici). */
  private textOf(p: Product): string {
    return searchable(`${p.title} ${p.brand ?? ""}`);
  }
  private matching(criteria: ProductCriteria): Product[] {
    return this.items.filter((p) => criteria.terms.every((t) => this.textOf(p).includes(t)));
  }
  count(criteria: ProductCriteria): Promise<number> {
    return Promise.resolve(new Set(this.matching(criteria).map((p) => p.listingId)).size);
  }
  similarWords(_term: string, limit: number): Promise<string[]> {
    const words = this.items.flatMap((p) => this.textOf(p).split(" "));
    return Promise.resolve([...new Set(words)].slice(0, limit));
  }
  brands(criteria: ProductCriteria, limit: number): Promise<string[]> {
    const brands = this.matching(criteria).flatMap((p) => (p.brand ? [p.brand] : []));
    return Promise.resolve([...new Set(brands)].slice(0, limit));
  }
  save(product: Product): Promise<void> {
    this.items = [...this.items.filter((p) => p.id !== product.id), product];
    return Promise.resolve();
  }
}
