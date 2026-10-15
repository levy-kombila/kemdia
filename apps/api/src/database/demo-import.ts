import "reflect-metadata";
import { demoCatalog } from "@kemdia/contracts/demo";
import { ConfigError, loadConfig, type AppConfig } from "../config/env.js";
import {
  importCatalog,
  prepareDemoCatalog,
} from "../modules/catalog/infrastructure/demo-catalog.js";
import { PrismaCategoryRepository } from "../modules/catalog/infrastructure/prisma-category.repository.js";
import { PrismaProductRepository } from "../modules/catalog/infrastructure/prisma-product.repository.js";
import { ensureDemoCoupon } from "../modules/orders/infrastructure/demo-coupon.js";
import { PrismaService } from "./prisma.service.js";

/**
 * Import du catalogue de démonstration (S3-T07) : 112 catégories, 50 produits, sans aucune donnée personnelle.
 *
 * Le même code sert :
 * - au poste de développement : `pnpm --filter @kemdia/api db:seed` (refusé seulement en production) ;
 * - à l'image Docker, sur la démo Render : `node dist/database/start-demo.js` (refusé partout sauf `APP_ENV=demo`).
 *
 * Relançable sans créer de doublon (identifiants UUID v5 fixes, écriture par « upsert »).
 * S5-T08 : sur la démo et le poste de développement seulement, le code promo de démonstration `DEMO10` est créé
 * (jamais en préproduction, où `db:seed` est aussi permis).
 * N'affiche aucune valeur de configuration (l'adresse de la base contient un mot de passe).
 */

type AppEnv = AppConfig["APP_ENV"];

export type DemoImporter = (
  config: AppConfig,
) => Promise<{ categories: number; products: number; coupon?: "créé" | "déjà présent" }>;

/** Environnements qui reçoivent le code promo de démonstration (S5-T08). */
export const DEMO_COUPON_ENVS: readonly AppEnv[] = ["local", "demo"];

export interface DemoImportOptions {
  env: NodeJS.ProcessEnv;
  /** Environnements où l'import est permis. */
  allowedEnvs: readonly AppEnv[];
  importer?: DemoImporter;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

/** Écrit le catalogue de démonstration dans la base désignée par la configuration. */
export const importDemoCatalog: DemoImporter = async (config) => {
  const prisma = new PrismaService(config);
  try {
    const catalog = await importCatalog(prepareDemoCatalog(demoCatalog), {
      categories: new PrismaCategoryRepository(prisma),
      products: new PrismaProductRepository(prisma),
    });
    if (!DEMO_COUPON_ENVS.includes(config.APP_ENV)) return catalog;
    return { ...catalog, coupon: await ensureDemoCoupon(prisma) };
  } finally {
    await prisma.$disconnect();
  }
};

/** Vérifie la configuration et l'environnement, puis importe. Renvoie le code de sortie (0 = réussi). */
export async function runDemoImport({
  env,
  allowedEnvs,
  importer = importDemoCatalog,
  log = console.log,
  error = console.error,
}: DemoImportOptions): Promise<number> {
  let config: AppConfig;
  try {
    config = loadConfig(env);
  } catch (problem) {
    if (problem instanceof ConfigError) {
      error(problem.message);
      return 1;
    }
    throw problem;
  }

  if (!allowedEnvs.includes(config.APP_ENV)) {
    error(
      `Import de démonstration refusé : APP_ENV=${config.APP_ENV} (permis : ${allowedEnvs.join(", ")}).`,
    );
    return 1;
  }

  const started = Date.now();
  try {
    const result = await importer(config);
    log(
      `Catalogue de démonstration importé : ${result.categories} catégories, ${result.products} produits ` +
        `(${((Date.now() - started) / 1000).toFixed(1)} s)` +
        (result.coupon ? ` ; code promo de démonstration ${result.coupon}.` : "."),
    );
    return 0;
  } catch (problem) {
    // Le message d'origine peut contenir l'adresse de la base : on n'affiche que son type et son code
    error(`Import de démonstration : ÉCHEC (${describeError(problem)}).`);
    return 1;
  }
}

/** « PrismaClientKnownRequestError P2002 », « Error ECONNREFUSED »… : assez pour chercher, sans valeur sensible. */
export function describeError(problem: unknown): string {
  if (!(problem instanceof Error)) return "erreur inconnue";
  const code = (problem as { code?: unknown }).code;
  return typeof code === "string" && /^[\w.-]{1,40}$/.test(code)
    ? `${problem.name} ${code}`
    : problem.name;
}
