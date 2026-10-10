import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CART_ERROR_CODES,
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  CART_TTL_DAYS,
} from "@kemdia/contracts/constants";
import {
  CART_TTL_DAYS as DOMAIN_TTL,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
} from "../src/modules/orders/domain/cart.js";
import { ORDERS_ERROR_STATUS } from "../src/modules/orders/interface/orders-http-errors.js";

/**
 * Limites du panier écrites à quatre endroits : contrat (site), domaine de l'API, migration SQL et panier du navigateur.
 * Si l'une change seule, ce test échoue.
 */
const migration = readFileSync(
  new URL("../prisma/migrations/20261010130000_panier/migration.sql", import.meta.url),
  "utf8",
);
const browserCart = readFileSync(new URL("../../web/src/lib/cart.ts", import.meta.url), "utf8");

describe("Panier : mêmes limites partout (S5-T01)", () => {
  it("domaine de l'API = contrat", () => {
    expect(MAX_CART_LINES).toBe(CART_MAX_LINES);
    expect(MAX_LINE_QUANTITY).toBe(CART_MAX_QUANTITY);
    expect(DOMAIN_TTL).toBe(CART_TTL_DAYS);
  });

  it("contraintes SQL = contrat", () => {
    expect(migration).toContain(`CHECK ("quantity" BETWEEN 1 AND ${CART_MAX_QUANTITY})`);
    expect(migration).toContain(`) > ${CART_MAX_LINES} THEN`);
  });

  it("le panier du navigateur reprend les constantes du contrat", () => {
    expect(browserCart).toContain("CART_MAX_QUANTITY");
    expect(browserCart).toContain("CART_MAX_LINES");
  });

  it("chaque code d'erreur du panier a son statut HTTP", () => {
    expect(Object.keys(ORDERS_ERROR_STATUS).sort()).toEqual([...CART_ERROR_CODES].sort());
  });
});
