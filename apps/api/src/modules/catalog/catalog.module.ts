import { Module } from "@nestjs/common";
import { CatalogService } from "./application/catalog.service.js";
import { CATEGORY_REPOSITORY, PRODUCT_REPOSITORY } from "./application/ports.js";
import { PrismaCategoryRepository } from "./infrastructure/prisma-category.repository.js";
import { PrismaProductRepository } from "./infrastructure/prisma-product.repository.js";

/**
 * Module catalog (ADR-0006) : catégories, produits, variantes, stock.
 * Les ports de l'application sont branchés ici sur leurs implémentations Prisma.
 * Les routes HTTP arrivent au S3-T04.
 */
@Module({
  providers: [
    CatalogService,
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
