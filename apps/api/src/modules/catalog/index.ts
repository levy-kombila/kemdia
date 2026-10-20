/**
 * Port public du module catalog : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * Le module `orders` y lit `CatalogService.describeLines` (panier serveur, S5-T01 : BR-001, BR-004).
 */
export { CatalogModule } from "./catalog.module.js";
export {
  CatalogService,
  MAX_AVAILABILITY_LINES,
  type AvailabilityLine,
  type AvailabilityResult,
  type CategoryView,
  type DescribedLine,
  type VariantSnapshot,
} from "./application/catalog.service.js";
export type {
  Facets,
  Page,
  PriceRange,
  ProductSummary,
  ReservedVariant,
  SortKey,
  StockLine,
} from "./application/ports.js";
export { StockService, StockUnavailableError } from "./application/stock.service.js";
// Produits des vendeurs et modération (S6-T02)
export {
  VendorCatalog,
  type ListingEditInput,
  type OfferLineInput,
  type VendorProductInput,
  type VendorVariantInput,
  type VendorVariantPatch,
} from "./application/vendor-catalog.service.js";
export type {
  ListingCorrectionRecord,
  ListingCursor,
  ListingRecord,
  VendorProductCursor,
  VendorProductRecord,
  VendorVariantRecord,
} from "./application/ports.js";
export type { Seller } from "./domain/listing.js";
export { CatalogError, type CatalogErrorCode } from "./domain/catalog-error.js";
export { VENDOR_PRODUCT_RULES, type ModerationDecision } from "./domain/vendor-product.js";
// Photos (S6-T04)
export {
  PRODUCT_IMAGE_RULES,
  type ImageSize,
  type ProcessedImage,
} from "./domain/product-image.js";
export type { StoredImage } from "./application/ports.js";
export { imageNotFound, sendImage } from "./interface/product-image.controller.js";
export { SORT_KEYS } from "./application/ports.js";
export type { ProductSearchInput } from "./application/product-search.js";
export type { Category, CategoryNode } from "./domain/category.js";
export type { Orderability, Product, ProductStatus, Variant } from "./domain/product.js";
