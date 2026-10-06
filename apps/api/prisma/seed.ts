import "reflect-metadata";
import { demoCatalog } from "@kemdia/contracts/demo";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import {
  importCatalog,
  prepareDemoCatalog,
} from "../src/modules/catalog/infrastructure/demo-catalog.js";
import { PrismaCategoryRepository } from "../src/modules/catalog/infrastructure/prisma-category.repository.js";
import { PrismaProductRepository } from "../src/modules/catalog/infrastructure/prisma-product.repository.js";

/**
 * Données de démonstration : `pnpm --filter @kemdia/api db:seed` (relançable sans créer de doublon).
 * Refusé en production : le vrai catalogue est saisi par l'équipe et les vendeurs.
 */
const config = loadConfig(process.env);
if (config.APP_ENV === "production") {
  console.error("Import de démonstration refusé : APP_ENV=production.");
  process.exit(1);
}

const prepared = prepareDemoCatalog(demoCatalog);

const prisma = new PrismaService(config);
try {
  const result = await importCatalog(prepared, {
    categories: new PrismaCategoryRepository(prisma),
    products: new PrismaProductRepository(prisma),
  });
  console.log(
    `Catalogue de démonstration importé : ${result.categories} catégories, ${result.products} produits.`,
  );
} finally {
  await prisma.$disconnect();
}
