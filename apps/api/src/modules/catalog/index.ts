/**
 * Port public du module catalog : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * Le module `orders` (S5) importera d'ici `CatalogService.checkAvailability` (BR-001).
 */
export { CatalogModule } from "./catalog.module.js";
export {
  CatalogService,
  MAX_AVAILABILITY_LINES,
  type AvailabilityLine,
  type AvailabilityResult,
  type CategoryView,
} from "./application/catalog.service.js";
export type { Facets, Page, PriceRange, ProductSummary, SortKey } from "./application/ports.js";
export { SORT_KEYS } from "./application/ports.js";
export type { ProductSearchInput } from "./application/product-search.js";
export type { Category, CategoryNode } from "./domain/category.js";
export type { Orderability, Product, ProductStatus, Variant } from "./domain/product.js";
