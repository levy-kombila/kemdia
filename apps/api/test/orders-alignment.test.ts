import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CART_ERROR_CODES,
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  CART_TTL_DAYS,
  MAX_OPEN_ORDERS,
  ORDER_ERROR_CODES,
  COUPON_ERROR_CODES,
  COUPON_PERCENT_MAX,
  ORDER_REFERENCE_ALPHABET,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_WINDOW_MINUTES,
} from "@kemdia/contracts/constants";
import * as delivery from "@kemdia/contracts/delivery";
import * as address from "../src/modules/orders/domain/delivery-address.js";
import * as coupon from "../src/modules/orders/domain/coupon.js";
import * as order from "../src/modules/orders/domain/order.js";
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

  it("chaque code d'erreur du panier et des commandes a son statut HTTP", () => {
    expect(Object.keys(ORDERS_ERROR_STATUS).sort()).toEqual(
      [...CART_ERROR_CODES, ...ORDER_ERROR_CODES, ...COUPON_ERROR_CODES].sort(),
    );
  });
});

describe("Commandes : mêmes règles dans le domaine et dans le contrat (S5-T02)", () => {
  it("statuts, moyens de paiement, numéro de commande, délai de paiement", () => {
    expect([...order.ORDER_STATUSES]).toEqual([...ORDER_STATUSES]);
    expect([...order.PAYMENT_METHODS]).toEqual([...PAYMENT_METHODS]);
    expect(order.REFERENCE_ALPHABET).toBe(ORDER_REFERENCE_ALPHABET);
    expect(order.PAYMENT_WINDOW_MS).toBe(PAYMENT_WINDOW_MINUTES * 60_000);
    expect(order.MAX_OPEN_ORDERS).toBe(MAX_OPEN_ORDERS);
    expect(coupon.COUPON_PERCENT_MAX).toBe(COUPON_PERCENT_MAX);
  });

  it("adresse : repère et « Autre quartier »", () => {
    expect(address.LANDMARK_MIN).toBe(delivery.LANDMARK_MIN);
    expect(address.LANDMARK_MAX).toBe(delivery.LANDMARK_MAX);
    expect(address.OTHER_NEIGHBORHOOD).toBe(delivery.OTHER_NEIGHBORHOOD);
  });
});
