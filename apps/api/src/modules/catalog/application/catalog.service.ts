import { Inject, Injectable, Optional } from "@nestjs/common";
import { MAX_AVAILABILITY_LINES, MAX_QUERY_LENGTH } from "@kemdia/contracts/constants";
import { CategoryTree, type Category, type CategoryNode } from "../domain/category.js";
import { ListingOffers } from "../domain/listing.js";
import { closestWord } from "../domain/spelling.js";
import { searchable } from "../domain/values.js";
import type { Orderability } from "../domain/product.js";
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
  type PublicShop,
  type PublicShops,
  type SharedCounters,
  CATALOG_COUNTERS,
  PUBLIC_SHOPS,
} from "./ports.js";
import {
  parseCity,
  parseProductSearch,
  searchTerms,
  type ProductSearch,
  type ProductSearchInput,
} from "./product-search.js";

/** Durée pendant laquelle l'arborescence est gardée en mémoire (elle change rarement). */
export const CATEGORY_CACHE_MS = 60_000;

/** Annuaire des boutiques (S7.5-T07) : 24 par page, 100 pages au plus. */
export const SHOP_PAGE_SIZE = 24;
const MAX_SHOP_PAGE = 100;
/** Adresse d'une boutique (même règle que la base : vendors.shops_slug_check). */
const SHOP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Quartier passé dans l'adresse : 2 à 80 caractères, lettres, chiffres, espaces et ponctuation simple. */
function parsePlaceName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return /^[\p{L}0-9][\p{L}0-9 '’.()-]{1,79}$/u.test(text) ? text : undefined;
}

/** Suggestions pendant la frappe (S7.5-T06) : 8 au plus en tout. */
export const SUGGESTION_LIMITS = { products: 4, categories: 2, brands: 2 } as const;
/** Il faut au moins 2 lettres ou chiffres pour proposer des suggestions. */
export const MIN_SUGGESTION_LENGTH = 2;
/** Mots proches demandés à la base pour corriger un mot. */
const SIMILAR_WORDS = 30;
/** Une correction est gardée 30 s (la liste et ses compteurs ne la paient qu'une fois). */
export const CORRECTION_CACHE_MS = 30_000;
const MAX_CORRECTIONS_KEPT = 500;
/**
 * Corrections cherchées en base par minute, tous visiteurs et toutes instances confondus (relecture de sécurité
 * S7.5-T06, compteur partagé depuis S8-T07) : la page de résultats est relayée par le site sans limite par visiteur ;
 * au-delà, la recherche se fait telle quelle.
 */
export const CORRECTION_BUDGET_PER_MINUTE = 120;

export interface SearchSuggestions {
  /** Mots corrigés (« iphone » pour « ipohne ») ; absent si rien n'a été corrigé. */
  correctedQuery?: string;
  products: ProductSummary[];
  categories: Category[];
  brands: string[];
}

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
  /**
   * Corrections récentes (S7.5-T06), 30 s en mémoire de chaque instance : simple gain de temps (une correction ne
   * dépend que du catalogue), le budget, lui, est commun (S8-T07).
   */
  private readonly corrections = new Map<string, { terms: readonly string[]; expires: number }>();
  /** Horloge (remplaçable dans les tests). */
  clock: () => number = Date.now;

  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    // Budget des corrections, commun à toutes les instances (S8-T07, ADR-0064)
    @Inject(CATALOG_COUNTERS) private readonly counters: SharedCounters,
    // Boutiques publiques (S7.5-T07) ; facultatif dans les tests qui ne s'en servent pas
    @Optional() @Inject(PUBLIC_SHOPS) private readonly shops: PublicShops | null = null,
  ) {}

  /**
   * Annuaire des boutiques (S7.5-T07) : boutiques actives, la boutique officielle d'abord, puis celles du quartier du
   * client, puis par nom. Une ville ou un quartier mal formé est ignoré (jamais d'erreur).
   */
  async listShops(input: { city?: unknown; neighborhood?: unknown; page?: unknown }) {
    const city = parseCity(input.city);
    const neighborhood = city ? parsePlaceName(input.neighborhood) : undefined;
    const page =
      typeof input.page === "string" && /^\d{1,4}$/.test(input.page) ? Number(input.page) : 1;
    if (!this.shops)
      return { items: [], page: 1, pageSize: SHOP_PAGE_SIZE, total: 0, totalPages: 1 };
    return this.shops.list({
      ...(city ? { city } : {}),
      ...(neighborhood ? { neighborhood } : {}),
      page: Math.min(Math.max(page, 1), MAX_SHOP_PAGE),
      pageSize: SHOP_PAGE_SIZE,
    });
  }

  /** Page publique d'une boutique (S7.5-T07) : `null` si l'adresse est inconnue ou la boutique pas active. */
  async getShop(slug: string): Promise<PublicShop | null> {
    if (!SHOP_SLUG.test(slug) || !this.shops) return null;
    return this.shops.findActiveBySlug(slug);
  }

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
   * Fiche produit (S7.5-T02) : la fiche publiée et ses offres VISIBLES (publiées, boutique non suspendue), avec l'offre
   * mise en avant (`city` : ville du client, qui départage deux offres au même prix). Fiche en modération, refusée,
   * archivée ou sans offre visible → introuvable. Un doublon fusionné mène à la fiche qui le remplace (une fois).
   */
  async getListing(slug: string, city?: unknown): Promise<ListingOffers | null> {
    if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
    let snapshot = await this.products.findListingBySlug(slug);
    if (snapshot?.mergedIntoSlug)
      snapshot = await this.products.findListingBySlug(snapshot.mergedIntoSlug);
    if (!snapshot || snapshot.status !== "PUBLISHED" || snapshot.mergedIntoSlug) return null;
    return ListingOffers.build({ ...snapshot, city: parseCity(city) ?? null });
  }

  /** Liste paginée : catégorie (et sous-catégories), recherche, filtres, tri. Catégorie inconnue → liste vide. */
  async searchProducts(
    input: ProductSearchInput,
  ): Promise<Page<ProductSummary> & { search: ProductSearch; correctedQuery?: string }> {
    const search = parseProductSearch(input);
    const criteria = await this.criteria(search);
    if (!criteria)
      return { items: [], page: 1, pageSize: search.pageSize, total: 0, totalPages: 1, search };
    const terms = await this.resolveTerms(search, criteria);
    const page = await this.products.search(
      { ...criteria, terms },
      search.sort,
      search.page,
      search.pageSize,
      search.city ?? null,
    );
    return { ...page, search, ...corrected(search.terms, terms) };
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
    const terms = await this.resolveTerms(search, criteria);
    return this.products.facets({ ...criteria, terms }, priceRanges.slice(0, 10));
  }

  /**
   * Suggestions pendant la frappe (S7.5-T06) : quelques produits, rayons et marques qui contiennent les mots tapés
   * (le dernier mot peut être incomplet : « sams » trouve « samsung »), avec la même correction des fautes que la
   * recherche. Moins de 2 lettres : rien.
   */
  async suggest(q: unknown): Promise<SearchSuggestions> {
    const typed = searchTerms(q);
    if (typed.join("").length < MIN_SUGGESTION_LENGTH)
      return { products: [], categories: [], brands: [] };
    const base: ProductCriteria = { terms: typed, brands: [], inStock: false, onlyDeals: false };
    const terms = await this.resolveTerms(
      { terms: typed, exact: false, promotionsOnly: false },
      base,
    );
    const criteria = { ...base, terms };
    const [page, brands, tree] = await Promise.all([
      this.products.search(criteria, "pertinence", 1, SUGGESTION_LIMITS.products),
      this.products.brands(criteria, 20),
      this.categoryTree(),
    ]);
    const matches = (text: string) => {
      const words = searchable(text);
      return terms.every((t) => words.includes(t));
    };
    return {
      ...corrected(typed, terms),
      products: page.items,
      categories: tree.all.filter((c) => matches(c.name)).slice(0, SUGGESTION_LIMITS.categories),
      // Une marque n'est proposée que si son NOM correspond à un mot tapé (pas toutes les marques des résultats)
      brands: brands
        .filter((b) => terms.some((t) => searchable(b).includes(t)))
        .slice(0, SUGGESTION_LIMITS.brands),
    };
  }

  /**
   * Recherche tolérante aux fautes (S7.5-T06, ADR-0053) : si les mots tapés ne trouvent AUCUNE fiche (catégorie et
   * sélection de la page comprises, filtres du client non compris : la décision est la même pour la liste et pour les
   * compteurs), chaque mot est remplacé par le mot le plus proche du catalogue. Mots inchangés si la recherche
   * exacte est demandée, si un mot ne trouve aucun remplaçant assez proche, ou si rien ne change.
   */
  private async resolveTerms(
    search: Pick<ProductSearch, "terms" | "exact" | "promotionsOnly">,
    criteria: ProductCriteria,
  ): Promise<readonly string[]> {
    if (!search.terms.length || search.exact) return search.terms;
    const base: ProductCriteria = {
      ...(criteria.categoryIds ? { categoryIds: criteria.categoryIds } : {}),
      terms: search.terms,
      brands: [],
      inStock: false,
      onlyDeals: search.promotionsOnly,
      ...(criteria.badge ? { badge: criteria.badge } : {}),
      ...(criteria.shopId ? { shopId: criteria.shopId } : {}),
    };
    // Même recherche il y a moins de 30 s (la liste puis ses compteurs, une page suivante…) : même réponse
    const key = JSON.stringify([
      base.categoryIds ?? null,
      base.terms,
      base.onlyDeals,
      base.badge,
      base.shopId ?? null,
    ]);
    const now = this.clock();
    const known = this.corrections.get(key);
    if (known && known.expires > now) return known.terms;
    const terms = await this.correct(base, now);
    if (this.corrections.size >= MAX_CORRECTIONS_KEPT) {
      for (const [k, v] of this.corrections) if (v.expires <= now) this.corrections.delete(k);
      if (this.corrections.size >= MAX_CORRECTIONS_KEPT)
        this.corrections.delete(this.corrections.keys().next().value as string);
    }
    this.corrections.set(key, { terms, expires: now + CORRECTION_CACHE_MS });
    return terms;
  }

  private async correct(base: ProductCriteria, now: number): Promise<readonly string[]> {
    const typed = base.terms;
    if ((await this.products.count(base)) > 0) return typed;
    // Budget commun à tous les visiteurs et à toutes les instances (relecture S7.5-T06, S8-T07) : au-delà, recherche
    // telle quelle
    const budget = await this.counters.hit("recherche:corrections", 60_000, new Date(now));
    if (budget.hits > CORRECTION_BUDGET_PER_MINUTE) return typed;
    const found = await this.products.similarWords(typed, SIMILAR_WORDS);
    const replacements = typed.map((term) => {
      const info = found.get(term);
      // Mot déjà présent dans le catalogue : jamais « corrigé » vers un autre
      if (info?.present) return term;
      return info ? closestWord(term, info.words) : null;
    });
    if (replacements.some((r) => r === null)) return typed;
    const terms = [...new Set(replacements as string[])];
    // Inchangé, ou plus long que le texte qu'on accepte (le contrat le refuserait) : recherche telle quelle
    if (terms.join(" ") === typed.join(" ") || terms.join(" ").length > MAX_QUERY_LENGTH)
      return typed;
    return terms;
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
          // Lien vers la fiche commune (S7.5-T02), pas vers l'offre
          slug: product.listingSlug,
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
    // Page d'une boutique (S7.5-T07) : boutique inconnue ou pas active → liste vide
    let shopId: string | undefined;
    if (search.shopSlug) {
      const shop = await this.getShop(search.shopSlug);
      if (!shop) return null;
      shopId = shop.shopId;
    }
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
      ...(shopId ? { shopId } : {}),
    };
  }
}

/** `correctedQuery` seulement si les mots ont été corrigés. */
function corrected(typed: readonly string[], used: readonly string[]): { correctedQuery?: string } {
  return typed === used ? {} : { correctedQuery: used.join(" ") };
}
