import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CatalogService } from "../application/catalog.service.js";
import type { ProductSearchInput } from "../application/product-search.js";
import {
  presentAvailability,
  presentCategory,
  presentCategoryNode,
  presentProduct,
} from "./presenters.js";
import { AvailabilityRequestSchema, type AvailabilityRequest } from "@kemdia/contracts";

/** Le catalogue change rarement : 60 s de cache côté client et relais (le site, un futur CDN). */
const CACHE_PUBLIC = "public, max-age=60, stale-while-revalidate=300";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Le paramètre de requête peut être répété (`?q=a&q=b`) : on garde la première valeur. */
function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function searchInput(query: Record<string, unknown>): ProductSearchInput {
  return {
    categorySlug: first(query.category),
    q: first(query.q),
    sort: first(query.sort),
    page: first(query.page),
    pageSize: first(query.pageSize),
    priceMin: first(query.priceMin),
    priceMax: first(query.priceMax),
    brands: first(query.brands),
    inStock: first(query.inStock),
    onlyDeals: first(query.onlyDeals),
    minRating: first(query.minRating),
    scope: first(query.scope),
    badge: first(query.badge),
  };
}

/**
 * Routes du catalogue (`/api/v1/…`). Lecture seule, sauf la vérification de disponibilité (BR-001),
 * qui ne modifie rien. La documentation est dans catalog.openapi.ts.
 */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories")
  @Header("Cache-Control", CACHE_PUBLIC)
  async categories() {
    return { items: (await this.catalog.getCategoryRoots()).map(presentCategoryNode) };
  }

  @Get("categories/:slug")
  @Header("Cache-Control", CACHE_PUBLIC)
  async category(@Param("slug") slug: string) {
    const view = SLUG.test(slug) ? await this.catalog.getCategory(slug) : null;
    if (!view) throw new NotFoundException();
    return {
      category: presentCategory(view.category),
      path: view.path.map(presentCategory),
      children: view.children.map(presentCategory),
    };
  }

  @Get("products")
  @Header("Cache-Control", CACHE_PUBLIC)
  async products(@Query() query: Record<string, unknown>) {
    const { items, page, pageSize, total, totalPages } = await this.catalog.searchProducts(
      searchInput(query),
    );
    return { items, page, pageSize, total, totalPages };
  }

  // Déclarée avant « products/:slug » : sinon « facets » serait pris pour l'adresse d'un produit
  @Get("products/facets")
  @Header("Cache-Control", CACHE_PUBLIC)
  facets(@Query() query: Record<string, unknown>) {
    return this.catalog.getFacets(searchInput(query));
  }

  @Get("products/:slug")
  @Header("Cache-Control", CACHE_PUBLIC)
  async product(@Param("slug") slug: string) {
    const product = await this.catalog.getProduct(slug);
    if (!product) throw new NotFoundException();
    return presentProduct(product, await this.catalog.categoryPath(product.categoryId));
  }

  /** BR-001 : chaque ligne est-elle commandable ? (le stock change : jamais mis en cache) */
  @Post("availability")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async availability(@Body({ schema: AvailabilityRequestSchema }) body: AvailabilityRequest) {
    return presentAvailability(await this.catalog.checkAvailability(body.lines));
  }
}
