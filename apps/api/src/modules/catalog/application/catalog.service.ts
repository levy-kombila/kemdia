import { Inject, Injectable } from "@nestjs/common";
import { MAX_AVAILABILITY_LINES } from "@kemdia/contracts/constants";
import { CategoryTree, type Category, type CategoryNode } from "../domain/category.js";
import type { Orderability, Product } from "../domain/product.js";
import {
  CATEGORY_REPOSITORY,
  DEFAULT_PRICE_RANGES,
  PRODUCT_REPOSITORY,
  type CategoryRepository,
  type Facets,
  type Page,
  type PriceRange,
  type ProductCriteria,
  type ProductRepository,
  type ProductSummary,
} from "./ports.js";
import {
  parseProductSearch,
  type ProductSearch,
  type ProductSearchInput,
} from "./product-search.js";

/** Durée pendant laquelle l'arborescence est gardée en mémoire (elle change rarement). */
export const CATEGORY_CACHE_MS = 60_000;

/** Un panier ne dépasse pas ce nombre de lignes (protection contre les requêtes démesurées). */
export { MAX_AVAILABILITY_LINES };

export interface CategoryView {
  category: Category;
  /** Fil d'Ariane, de la racine à la catégorie incluse. */
  path: Category[];
  children: readonly Category[];
}

export interface AvailabilityLine {
  variantId: string;
  quantity: number;
}

export type AvailabilityResult = AvailabilityLine & Orderability;

/** Ce qu'un panier affiche d'une variante : informations ACTUELLES du catalogue (BR-004 : le prix vient d'ici). */
export interface VariantSnapshot {
  variantId: string;
  productId: string;
  slug: string;
  title: string;
  variantName: string;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  /** Stock commandable maintenant : 0 si le produit n'est plus publié ou la variante plus active (BR-001). */
  stock: number;
}

/** Ligne vérifiée (BR-001) avec, si la variante existe encore, ce qu'il faut pour l'afficher. */
export type DescribedLine = AvailabilityResult & { variant: VariantSnapshot | null };

/**
 * Service de lecture du catalogue : c'est lui que l'API REST (S3-T04) et le module `orders` (S5) appellent.
 * Il ne connaît ni HTTP ni Prisma : seulement le domaine et les ports.
 */
@Injectable()
export class CatalogService {
  private tree: { value: CategoryTree; loadedAt: number } | null = null;
  /** Horloge (remplaçable dans les tests). */
  clock: () => number = Date.now;

  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
  ) {}

  async categoryTree(): Promise<CategoryTree> {
    const time = this.clock();
    if (!this.tree || time - this.tree.loadedAt > CATEGORY_CACHE_MS) {
      this.tree = { value: new CategoryTree(await this.categories.findAll()), loadedAt: time };
    }
    return this.tree.value;
  }

  /** À appeler après une modification des catégories (back-office, import). */
  invalidateCategories(): void {
    this.tree = null;
  }

  async getCategoryRoots(): Promise<readonly CategoryNode[]> {
    return (await this.categoryTree()).roots;
  }

  /** Fil d'Ariane d'une catégorie (fiche produit). Vide si la catégorie n'existe plus. */
  async categoryPath(categoryId: string): Promise<Category[]> {
    return (await this.categoryTree()).path(categoryId);
  }

  async getCategory(slug: string): Promise<CategoryView | null> {
    const tree = await this.categoryTree();
    const category = tree.bySlugOrNull(slug);
    if (!category) return null;
    return { category, path: tree.path(category.id), children: tree.children(category.id) };
  }

  /**
   * Fiche produit : seuls les produits visibles (publiés, boutique non suspendue) ; brouillons, produits en modération,
   * refusés, archivés → introuvable.
   */
  async getProduct(slug: string): Promise<Product | null> {
    if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
    const product = await this.products.findBySlug(slug);
    return product?.isVisible ? product : null;
  }

  /** Liste paginée : catégorie (et sous-catégories), recherche, filtres, tri. Catégorie inconnue → liste vide. */
  async searchProducts(
    input: ProductSearchInput,
  ): Promise<Page<ProductSummary> & { search: ProductSearch }> {
    const search = parseProductSearch(input);
    const criteria = await this.criteria(search);
    if (!criteria)
      return { items: [], page: 1, pageSize: search.pageSize, total: 0, totalPages: 1, search };
    const page = await this.products.search(criteria, search.sort, search.page, search.pageSize);
    return { ...page, search };
  }

  /** Compteurs des filtres pour la même catégorie / recherche, filtres non appliqués. */
  async getFacets(
    input: ProductSearchInput,
    priceRanges: readonly PriceRange[] = DEFAULT_PRICE_RANGES,
  ): Promise<Facets> {
    const search = parseProductSearch(input);
    const criteria = await this.criteria({
      ...search,
      brands: [],
      inStock: false,
      onlyDeals: false,
      priceMin: undefined,
      priceMax: undefined,
      minRating: undefined,
    });
    if (!criteria)
      return {
        brands: [],
        prices: priceRanges.map(({ key }) => ({ key, count: 0 })),
        inStock: 0,
        deals: 0,
        rating4: 0,
      };
    return this.products.facets(criteria, priceRanges.slice(0, 10));
  }

  /**
   * BR-001 : chaque ligne d'un panier ou d'une commande est-elle commandable ?
   * Réponse ligne par ligne (le panier peut indiquer précisément ce qui manque).
   */
  async checkAvailability(lines: readonly AvailabilityLine[]): Promise<AvailabilityResult[]> {
    if (lines.length > MAX_AVAILABILITY_LINES) {
      throw new RangeError(`${MAX_AVAILABILITY_LINES} lignes au plus par vérification`);
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const ids = [...new Set(lines.map((l) => l.variantId).filter((id) => uuid.test(id)))];
    const products = ids.length ? await this.products.findByVariantIds(ids) : [];
    const productOf = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, p] as const)));
    return lines.map((line) => {
      const product = productOf.get(line.variantId);
      const result: Orderability = product
        ? product.checkOrderable(line.variantId, line.quantity)
        : { ok: false, reason: "VARIANTE_INCONNUE" };
      return { ...line, ...result };
    });
  }

  /**
   * Lignes d'un panier : vérification BR-001 (comme `checkAvailability`) et informations actuelles de chaque variante
   * (titre, prix, image, stock). Utilisé par le panier serveur du module `orders` (S5-T01). Une variante supprimée du
   * catalogue revient avec `variant: null` et la raison `VARIANTE_INCONNUE`.
   */
  async describeLines(lines: readonly AvailabilityLine[]): Promise<DescribedLine[]> {
    if (lines.length > MAX_AVAILABILITY_LINES) {
      throw new RangeError(`${MAX_AVAILABILITY_LINES} lignes au plus par vérification`);
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    // Comparaison en minuscules : PostgreSQL ne distingue pas la casse d'un UUID, le code oui
    const ids = [
      ...new Set(lines.map((l) => l.variantId.toLowerCase()).filter((id) => uuid.test(id))),
    ];
    const products = ids.length ? await this.products.findByVariantIds(ids) : [];
    const productOf = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, p] as const)));
    return lines.map((line) => {
      const id = line.variantId.toLowerCase();
      const product = productOf.get(id);
      if (!product) return { ...line, ok: false, reason: "VARIANTE_INCONNUE", variant: null };
      const variant = product.variants.find((v) => v.id === id)!;
      const sellable = product.isVisible && variant.isActive;
      return {
        ...line,
        ...product.checkOrderable(id, line.quantity),
        // Produit invisible (en modération, refusé, archivé, boutique suspendue) : ni son titre ni sa photo, qui
        // peuvent ne pas avoir été modérés (relecture de sécurité S6-T02)
        variant: {
          variantId: variant.id,
          productId: product.id,
          slug: product.slug,
          title: product.isVisible ? product.title : "Produit indisponible",
          variantName:
            product.isVisible && product.variants.filter((v) => v.isActive).length > 1
              ? variant.name
              : "",
          image: product.isVisible ? (product.images[0] ?? null) : null,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          stock: sellable ? variant.stock : 0,
        },
      };
    });
  }

  private async criteria(search: ProductSearch): Promise<ProductCriteria | null> {
    let categoryIds: string[] | undefined;
    if (search.categorySlug) {
      const tree = await this.categoryTree();
      const category = tree.bySlugOrNull(search.categorySlug);
      if (!category) return null;
      categoryIds = tree.descendantIds(category.id);
    }
    return {
      ...(categoryIds ? { categoryIds } : {}),
      terms: search.terms,
      ...(search.priceMin !== undefined ? { priceMin: search.priceMin } : {}),
      ...(search.priceMax !== undefined ? { priceMax: search.priceMax } : {}),
      brands: search.brands,
      inStock: search.inStock,
      // Page Promotions : la liste de base est déjà limitée aux promotions (compteurs compris)
      onlyDeals: search.onlyDeals || search.promotionsOnly,
      ...(search.minRating !== undefined ? { minRating: search.minRating } : {}),
      ...(search.badge ? { badge: search.badge } : {}),
    };
  }
}
