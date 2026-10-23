import { Inject, Injectable } from "@nestjs/common";
import { CATALOG_IMPORT_LIMITS } from "@kemdia/contracts/constants";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import {
  CatalogError,
  MAX_PRICE_FCFA,
  MAX_STOCK,
  VENDOR_PRODUCT_RULES,
  VendorCatalog,
} from "../../catalog/index.js";
import {
  parseCatalogImport,
  type ImportIssue,
  type ImportRules,
  type ImportedProduct,
} from "../domain/catalog-import.js";
import type { Shop } from "../domain/shop.js";
import {
  SHOP_REPOSITORY,
  VENDORS_TRANSACTION,
  type ShopRepository,
  type VendorsTransaction,
} from "./ports.js";

export const IMPORT_RULES: ImportRules = {
  maxRows: CATALOG_IMPORT_LIMITS.maxRows,
  referenceMax: CATALOG_IMPORT_LIMITS.referenceMax,
  errorsMax: CATALOG_IMPORT_LIMITS.errorsMax,
  titleMin: VENDOR_PRODUCT_RULES.titleMin,
  titleMax: VENDOR_PRODUCT_RULES.titleMax,
  descriptionMin: VENDOR_PRODUCT_RULES.descriptionMin,
  descriptionMax: VENDOR_PRODUCT_RULES.descriptionMax,
  brandMin: VENDOR_PRODUCT_RULES.brandMin,
  brandMax: VENDOR_PRODUCT_RULES.brandMax,
  variantNameMax: VENDOR_PRODUCT_RULES.variantNameMax,
  variantsMax: VENDOR_PRODUCT_RULES.variantsMax,
  priceMax: MAX_PRICE_FCFA,
  stockMax: MAX_STOCK,
};

/** Un import de 1 000 lignes écrit beaucoup : jusqu'à 2 minutes pour la transaction. */
const IMPORT_TIMEOUT_MS = 120_000;

export type ImportMode = "check" | "import";

export interface CatalogImportReport {
  mode: ImportMode;
  valid: boolean;
  rows: number;
  products: number;
  variants: number;
  alreadyImported: number;
  created: number;
  shops: { slug: string; name: string; products: number }[];
  issues: ImportIssue[];
  issueCount: number;
}

type CatalogPort = Pick<VendorCatalog, "importProduct" | "importedReferences" | "categoriesBySlug">;

/** Erreur survenue pendant l'écriture : tout est annulé, le compte rendu la montre. */
class ImportAborted extends Error {
  constructor(readonly issue: ImportIssue) {
    super(issue.message);
  }
}

/**
 * Import du vrai catalogue par l'équipe Catalogue (S8-T03, ADR-0058), dans les boutiques des vendeurs partenaires.
 * « Vérifier » ne fait que lire ; « Importer »
 * revérifie tout puis écrit TOUT le fichier dans une seule transaction, ou rien. Les produits créés suivent le chemin
 * d'un vendeur : produit et fiche **en attente de modération** (photos ajoutées ensuite par la boutique, validation
 * par l'équipe). Une référence déjà importée dans la boutique est ignorée : relancer le même fichier ne crée rien.
 */
@Injectable()
export class CatalogImportService {
  clock: () => Date = () => new Date();

  constructor(
    @Inject(SHOP_REPOSITORY) private readonly shops: ShopRepository,
    @Inject(VENDORS_TRANSACTION) private readonly tx: VendorsTransaction,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(VendorCatalog) private readonly catalog: CatalogPort,
  ) {}

  check(csv: string): Promise<CatalogImportReport> {
    return this.prepare("check", csv).then((p) => p.report);
  }

  async import(staffId: string, csv: string, context: AuditContext): Promise<CatalogImportReport> {
    const first = await this.prepare("import", csv);
    if (!first.report.valid || first.report.products === 0) return first.report;
    try {
      return await this.tx.run(
        async () => {
          // Boutiques verrouillées (toujours dans le même ordre) : une suspension ou un autre import attend la fin
          const shops = [...first.shops.values()].sort((a, b) => a.id.localeCompare(b.id));
          for (const shop of shops) {
            const locked = await this.shops.lockById(shop.id);
            if (locked?.status !== "active") {
              throw new ImportAborted({
                line: 0,
                column: "boutique",
                message: `la boutique « ${shop.slug} » n'est plus active : rien n'a été importé`,
              });
            }
          }
          // Relu sous le verrou : un autre import a pu créer les mêmes références entre-temps
          const { report, todo } = await this.prepare("import", csv);
          if (!report.valid)
            throw new ImportAborted(
              report.issues[0] ?? { line: 0, column: null, message: "fichier refusé" },
            );
          const now = this.clock();
          let created = 0;
          for (const { product, shopId, categoryId } of todo) {
            try {
              await this.catalog.importProduct(
                shopId,
                {
                  title: product.title,
                  description: product.description,
                  brand: product.brand,
                  categoryId,
                  variants: product.variants.map((v) => ({
                    name: v.name || "Standard",
                    price: v.price,
                    compareAtPrice: v.compareAtPrice,
                    stock: v.stock,
                  })),
                },
                product.reference,
                now,
              );
              created += 1;
            } catch (error) {
              if (error instanceof CatalogError) {
                throw new ImportAborted({
                  line: product.line,
                  column: null,
                  message: `${error.message} : rien n'a été importé`,
                });
              }
              throw error;
            }
          }
          await this.audit.record({
            action: "catalog.imported",
            actor: { type: "account", id: staffId },
            target: null,
            details: {
              products: created,
              variants: report.variants,
              shops: report.shops
                .map((s) => s.slug)
                .join(",")
                .slice(0, 100),
              skipped: report.alreadyImported,
            },
            context,
          });
          return { ...report, created };
        },
        { timeoutMs: IMPORT_TIMEOUT_MS },
      );
    } catch (error) {
      if (error instanceof ImportAborted) {
        return { ...first.report, valid: false, created: 0, issues: [error.issue], issueCount: 1 };
      }
      throw error;
    }
  }

  /** Vérifie le fichier, les boutiques, les catégories et les références déjà importées ; n'écrit rien. */
  private async prepare(
    mode: ImportMode,
    csv: string,
  ): Promise<{
    report: CatalogImportReport;
    shops: Map<string, Shop>;
    todo: { product: ImportedProduct; shopId: string; categoryId: string }[];
  }> {
    const parsed = parseCatalogImport(csv, IMPORT_RULES);
    const issues = [...parsed.issues];
    let issueCount = parsed.issueCount;
    const issue = (value: ImportIssue) => {
      issueCount += 1;
      if (issues.length < IMPORT_RULES.errorsMax) issues.push(value);
    };

    // Boutiques des vendeurs partenaires, actives. La boutique officielle n'est pas importable : ses produits ne
    // passent pas par la modération et aucun vendeur ne peut y ajouter les photos (ADR-0058)
    const shops = new Map<string, Shop>();
    const official = new Set<string>();
    for (const slug of new Set(parsed.products.map((p) => p.shop))) {
      const shop = await this.shops.findBySlug(slug);
      if (shop?.kind === "kemdia") official.add(slug);
      else if (shop?.status === "active") shops.set(slug, shop);
    }
    const categories: Map<string, { id: string; name: string }> = parsed.products.length
      ? await this.catalog.categoriesBySlug()
      : new Map<string, { id: string; name: string }>();
    const done = new Map<string, Set<string>>();
    for (const [slug, shop] of shops) {
      const references = parsed.products.filter((p) => p.shop === slug).map((p) => p.reference);
      done.set(slug, await this.catalog.importedReferences(shop.id, references));
    }

    const todo: { product: ImportedProduct; shopId: string; categoryId: string }[] = [];
    let alreadyImported = 0;
    const perShop = new Map<string, number>();
    for (const product of parsed.products) {
      const shop = shops.get(product.shop);
      const category = categories.get(product.category);
      if (!shop) {
        issue({
          line: product.line,
          column: "boutique",
          message: official.has(product.shop)
            ? "la boutique officielle Kemdia ne s'importe pas : choisissez la boutique d'un vendeur partenaire"
            : `boutique « ${product.shop} » inconnue ou pas active`,
        });
      }
      if (!category) {
        issue({
          line: product.line,
          column: "categorie",
          message: `catégorie « ${product.category} » inconnue`,
        });
      }
      if (!shop || !category) continue;
      if (done.get(product.shop)?.has(product.reference.toLowerCase())) {
        alreadyImported += 1;
        continue;
      }
      todo.push({ product, shopId: shop.id, categoryId: category.id });
      perShop.set(product.shop, (perShop.get(product.shop) ?? 0) + 1);
    }
    const valid = issueCount === 0;
    return {
      shops,
      todo: valid ? todo : [],
      report: {
        mode,
        valid,
        rows: parsed.rows,
        products: valid ? todo.length : 0,
        variants: valid ? todo.reduce((n, t) => n + t.product.variants.length, 0) : 0,
        alreadyImported: valid ? alreadyImported : 0,
        created: 0,
        shops: valid
          ? [...perShop].map(([slug, products]) => ({
              slug,
              name: shops.get(slug)?.name ?? slug,
              products,
            }))
          : [],
        issues,
        issueCount,
      },
    };
  }
}
