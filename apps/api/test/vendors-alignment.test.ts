import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KEMDIA_SHOP_ID,
  VENDOR_PRODUCT_LIMITS,
  VENDOR_PRODUCT_STATUSES,
  SHOP_LIMITS,
  SHOP_STATUSES,
  VENDOR_ERROR_CODES,
  PRODUCT_IMAGE_LIMITS,
  VENDOR_IMAGE_PATH_PATTERN,
  KYC_DOCUMENT_KINDS,
  KYC_DOCUMENT_RETENTION_DAYS,
  KYC_LIMITS,
  KYC_STATUSES,
} from "@kemdia/contracts/constants";
import {
  KYC_DOCUMENT_KINDS as DOMAIN_KYC_KINDS,
  KYC_RULES,
  KYC_STATUSES as DOMAIN_KYC_STATUSES,
} from "../src/modules/vendors/domain/kyc.js";
import {
  PRODUCT_IMAGE_RULES,
  vendorImageId,
  vendorImagePath,
} from "../src/modules/catalog/domain/product-image.js";
import { VENDOR_PRODUCT_RULES } from "../src/modules/catalog/domain/vendor-product.js";
import { PRODUCT_STATUSES } from "../src/modules/catalog/domain/product.js";
import { SHOP_RULES } from "../src/modules/vendors/domain/shop.js";
import {
  CATALOG_ERROR_CODES_FOR_VENDORS,
  VENDORS_ERROR_STATUS,
} from "../src/modules/vendors/interface/vendors-http-errors.js";

/**
 * Règles des boutiques écrites à quatre endroits : contrat (site), domaine de l'API, migration SQL et schéma Prisma
 * (identifiant de la boutique Kemdia). Si l'une change seule, ce test échoue (S6-T01).
 */
const migration = readFileSync(
  new URL("../prisma/migrations/20261015210000_boutiques/migration.sql", import.meta.url),
  "utf8",
);
const productMigration = readFileSync(
  new URL("../prisma/migrations/20261016091000_produits_vendeurs/migration.sql", import.meta.url),
  "utf8",
);
const kycMigration = readFileSync(
  new URL("../prisma/migrations/20261017120000_kyc_vendeurs/migration.sql", import.meta.url),
  "utf8",
);
const imageMigration = readFileSync(
  new URL("../prisma/migrations/20261016130000_photos_produits/migration.sql", import.meta.url),
  "utf8",
);
const catalogSchema = readFileSync(
  new URL("../prisma/schema/catalog.prisma", import.meta.url),
  "utf8",
);

describe("Boutiques : mêmes règles partout (S6-T01)", () => {
  it("domaine de l'API = contrat", () => {
    expect(SHOP_RULES).toEqual(SHOP_LIMITS);
  });

  it("contraintes SQL = contrat", () => {
    expect(migration).toContain(
      `char_length("name") BETWEEN ${SHOP_LIMITS.nameMin} AND ${SHOP_LIMITS.nameMax}`,
    );
    expect(migration).toContain(
      `char_length("city") BETWEEN ${SHOP_LIMITS.cityMin} AND ${SHOP_LIMITS.cityMax}`,
    );
    expect(migration).toContain(
      `char_length("description") BETWEEN ${SHOP_LIMITS.descriptionMin} AND ${SHOP_LIMITS.descriptionMax}`,
    );
    expect(migration).toContain(
      `char_length("status_reason") BETWEEN ${SHOP_LIMITS.reasonMin} AND ${SHOP_LIMITS.reasonMax}`,
    );
    for (const status of SHOP_STATUSES) expect(migration).toContain(`'${status.toUpperCase()}'`);
  });

  it("la boutique Kemdia a le même identifiant dans le contrat, la migration et Prisma", () => {
    // Valeur par défaut de shop_id, contrainte « une seule boutique Kemdia », ligne insérée
    expect(migration.split(KEMDIA_SHOP_ID).length - 1).toBe(3);
    // dbgenerated : forme gardée par PostgreSQL, sinon db:check voit une différence (correctif du 2026-10-16)
    expect(catalogSchema).toContain(`@default(dbgenerated("'${KEMDIA_SHOP_ID}'::uuid"))`);
  });

  it("chaque code d'erreur des boutiques et des produits des vendeurs a son statut HTTP", () => {
    expect(
      // Photos (S6-T08) : les mêmes codes viennent du catalogue ET de la vérification des vendeurs
      [
        ...new Set([...Object.keys(VENDORS_ERROR_STATUS), ...CATALOG_ERROR_CODES_FOR_VENDORS]),
      ].sort(),
    ).toEqual([...VENDOR_ERROR_CODES].sort());
  });

  it("produits des vendeurs (S6-T02) : limites et statuts identiques dans le domaine, le contrat et le SQL", () => {
    expect(VENDOR_PRODUCT_RULES).toEqual(VENDOR_PRODUCT_LIMITS);
    expect(VENDOR_PRODUCT_STATUSES.map((s) => s.toUpperCase()).sort()).toEqual(
      [...PRODUCT_STATUSES].sort(),
    );
    expect(productMigration).toContain(
      `char_length("moderation_reason") BETWEEN ${VENDOR_PRODUCT_LIMITS.reasonMin} AND ${VENDOR_PRODUCT_LIMITS.reasonMax}`,
    );
    expect(productMigration).toContain(`"shop_id" <> '${KEMDIA_SHOP_ID}'`);
  });

  it("photos (S6-T04) : limites identiques dans le domaine, le contrat et le SQL ; même forme d'adresse", () => {
    expect(PRODUCT_IMAGE_RULES).toEqual(PRODUCT_IMAGE_LIMITS);
    const stored = PRODUCT_IMAGE_LIMITS.maxStoredBytes;
    expect(imageMigration).toContain(`octet_length("large") BETWEEN 16 AND ${stored}`);
    expect(imageMigration).toContain(`octet_length("small") BETWEEN 16 AND ${stored}`);
    const side = PRODUCT_IMAGE_LIMITS.largeSide;
    expect(imageMigration).toContain(
      `"width" BETWEEN 1 AND ${side} AND "height" BETWEEN 1 AND ${side}`,
    );
    const id = "0f0e0d0c-0b0a-4908-8706-050403020100";
    expect(vendorImagePath(id)).toMatch(VENDOR_IMAGE_PATH_PATTERN);
    expect(vendorImageId(vendorImagePath(id))).toBe(id);
    for (const path of ["/images/v/x.webp", `/images/v/${id}.png`, `/images/products/${id}.webp`]) {
      expect(VENDOR_IMAGE_PATH_PATTERN.test(path)).toBe(false);
      expect(vendorImageId(path)).toBeNull();
    }
  });

  it("vérification des vendeurs (S6-T08) : limites, statuts et durée de conservation identiques partout", () => {
    const { reasonMin, reasonMax, retentionDays, ...limits } = KYC_RULES;
    expect(limits).toEqual(KYC_LIMITS);
    expect(retentionDays).toBe(KYC_DOCUMENT_RETENTION_DAYS);
    expect([reasonMin, reasonMax]).toEqual([SHOP_LIMITS.reasonMin, SHOP_LIMITS.reasonMax]);
    expect([...DOMAIN_KYC_STATUSES]).toEqual([...KYC_STATUSES]);
    expect([...DOMAIN_KYC_KINDS]).toEqual([...KYC_DOCUMENT_KINDS]);
    expect(kycMigration).toContain(
      `char_length("rccm_number") BETWEEN ${KYC_LIMITS.rccmMin} AND ${KYC_LIMITS.rccmMax}`,
    );
    expect(kycMigration).toContain(`BETWEEN ${KYC_LIMITS.nameMin} AND ${KYC_LIMITS.nameMax}`);
    expect(kycMigration).toContain(`BETWEEN ${reasonMin} AND ${reasonMax}`);
    expect(kycMigration).toContain(`"shop_id" <> '${KEMDIA_SHOP_ID}'`);
  });
});
