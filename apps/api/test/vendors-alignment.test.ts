import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KEMDIA_SHOP_ID,
  SHOP_LIMITS,
  SHOP_STATUSES,
  VENDOR_ERROR_CODES,
} from "@kemdia/contracts/constants";
import { SHOP_RULES } from "../src/modules/vendors/domain/shop.js";
import { VENDORS_ERROR_STATUS } from "../src/modules/vendors/interface/vendors-http-errors.js";

/**
 * Règles des boutiques écrites à quatre endroits : contrat (site), domaine de l'API, migration SQL et schéma Prisma
 * (identifiant de la boutique Kemdia). Si l'une change seule, ce test échoue (S6-T01).
 */
const migration = readFileSync(
  new URL("../prisma/migrations/20261015210000_boutiques/migration.sql", import.meta.url),
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
    expect(catalogSchema).toContain(`@default("${KEMDIA_SHOP_ID}")`);
  });

  it("chaque code d'erreur des boutiques a son statut HTTP", () => {
    expect(Object.keys(VENDORS_ERROR_STATUS).sort()).toEqual([...VENDOR_ERROR_CODES].sort());
  });
});
