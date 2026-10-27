import { Module } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { CatalogService } from "./application/catalog.service.js";
import {
  CATALOG_RANDOM,
  IMAGE_PROCESSOR,
  PRODUCT_IMAGE_STORE,
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
  STOCK_REPOSITORY,
  VENDOR_PRODUCT_REPOSITORY,
  LISTING_REPOSITORY,
  LISTING_CORRECTION_REPOSITORY,
  SELLER_DIRECTORY,
  PUBLIC_SHOPS,
} from "./application/ports.js";
import { VendorCatalog } from "./application/vendor-catalog.service.js";
import { PrismaVendorProductRepository } from "./infrastructure/prisma-vendor-product.repository.js";
import { ListingRatings } from "./infrastructure/listing-ratings.js";
import { PrismaListingRepository } from "./infrastructure/prisma-listing.repository.js";
import { PrismaPublicShopsRepository } from "./infrastructure/prisma-public-shops.repository.js";
import { PrismaListingCorrectionRepository } from "./infrastructure/prisma-listing-correction.repository.js";
import { PrismaProductImageStore } from "./infrastructure/prisma-product-image.store.js";
import { SharpImageProcessor } from "./infrastructure/sharp-image-processor.js";
import { StockService } from "./application/stock.service.js";
import { PrismaStockRepository } from "./infrastructure/prisma-stock.repository.js";
import { PrismaCategoryRepository } from "./infrastructure/prisma-category.repository.js";
import { PrismaProductRepository } from "./infrastructure/prisma-product.repository.js";
import { CatalogController } from "./interface/catalog.controller.js";
import { ProductImageController } from "./interface/product-image.controller.js";
import { sharedCountersProvider } from "./infrastructure/shared-counters.js";

/** `size` caractères tirés au hasard (cryptographiquement) dans `alphabet`. */
function pick(alphabet: string, size: number): string {
  return Array.from(randomBytes(size), (byte) => alphabet[byte % alphabet.length]).join("");
}

/**
 * Module catalog (ADR-0006) : catégories, produits, variantes, stock.
 * Les ports de l'application sont branchés ici sur leurs implémentations Prisma.
 * Routes HTTP : interface/catalog.controller.ts (`/api/v1/…`).
 */
@Module({
  controllers: [CatalogController, ProductImageController],
  providers: [
    CatalogService,
    StockService,
    // Fiches vues par le module reviews (S8-T01)
    ListingRatings,
    { provide: STOCK_REPOSITORY, useClass: PrismaStockRepository },
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    // Annuaire et pages publiques des boutiques (S7.5-T07)
    { provide: PUBLIC_SHOPS, useClass: PrismaPublicShopsRepository },
    // Compteurs partagés par les instances (S8-T07) : budget des corrections de la recherche
    sharedCountersProvider,
    // Produits des vendeurs et modération (S6-T02) : utilisé par le module vendors, qui décide des droits
    VendorCatalog,
    // Photos des produits (S6-T04) : réencodage sharp, rangement PostgreSQL (port remplaçable)
    { provide: IMAGE_PROCESSOR, useClass: SharpImageProcessor },
    { provide: PRODUCT_IMAGE_STORE, useClass: PrismaProductImageStore },
    { provide: VENDOR_PRODUCT_REPOSITORY, useClass: PrismaVendorProductRepository },
    // Fiches communes et boutiques vues du catalogue (S7.5-T02) : une seule instance pour les deux ports
    PrismaListingRepository,
    { provide: LISTING_REPOSITORY, useExisting: PrismaListingRepository },
    { provide: SELLER_DIRECTORY, useExisting: PrismaListingRepository },
    { provide: LISTING_CORRECTION_REPOSITORY, useClass: PrismaListingCorrectionRepository },
    {
      provide: CATALOG_RANDOM,
      useValue: {
        uuid: () => randomUUID(),
        slugSuffix: (size: number) => pick("abcdefghijklmnopqrstuvwxyz0123456789", size),
        skuPrefix: () => pick("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 8),
      },
    },
  ],
  exports: [CatalogService, StockService, VendorCatalog, ListingRatings],
})
export class CatalogModule {}
