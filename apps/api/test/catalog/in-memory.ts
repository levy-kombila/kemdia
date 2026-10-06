import type {
  CategoryRepository,
  Facets,
  Page,
  PriceRange,
  ProductCriteria,
  ProductRepository,
  ProductSummary,
  SortKey,
} from "../../src/modules/catalog/application/ports.js";
import type { Category } from "../../src/modules/catalog/domain/category.js";
import type { Product } from "../../src/modules/catalog/domain/product.js";

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

export class InMemoryProducts implements ProductRepository {
  lastCriteria: ProductCriteria | undefined;
  constructor(public items: Product[] = []) {}
  findBySlug(slug: string): Promise<Product | null> {
    return Promise.resolve(this.items.find((p) => p.slug === slug) ?? null);
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
  save(product: Product): Promise<void> {
    this.items = [...this.items.filter((p) => p.id !== product.id), product];
    return Promise.resolve();
  }
}
