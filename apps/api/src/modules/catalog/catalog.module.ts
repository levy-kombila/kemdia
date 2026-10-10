import { Module } from "@nestjs/common";
import { CatalogService } from "./application/catalog.service.js";
import { CATEGORY_REPOSITORY, PRODUCT_REPOSITORY, STOCK_REPOSITORY } from "./application/ports.js";
import { StockService } from "./application/stock.service.js";
import { PrismaStockRepository } from "./infrastructure/prisma-stock.repository.js";
import { PrismaCategoryRepository } from "./infrastructure/prisma-category.repository.js";
import { PrismaProductRepository } from "./infrastructure/prisma-product.repository.js";
import { CatalogController } from "./interface/catalog.controller.js";

/**
 * Module catalog (ADR-0006) : catégories, produits, variantes, stock.
 * Les ports de l'application sont branchés ici sur leurs implémentations Prisma.
 * Routes HTTP : interface/catalog.controller.ts (`/api/v1/…`).
 */
@Module({
  controllers: [CatalogController],
  providers: [
    CatalogService,
    StockService,
    { provide: STOCK_REPOSITORY, useClass: PrismaStockRepository },
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
  ],
  exports: [CatalogService, StockService],
})
export class CatalogModule {}
