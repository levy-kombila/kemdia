import * as contract from "@kemdia/contracts/constants";
import { describe, expect, it } from "vitest";
import { MAX_ORDER_QUANTITY } from "../src/modules/catalog/domain/product.js";

/**
 * Le domaine ne dépend pas du contrat HTTP (règle d'architecture) : quand une même règle existe des deux côtés,
 * ce test vérifie qu'elles ont la même valeur.
 */
describe("Domaine et contrat HTTP alignés", () => {
  it("quantité maximale d'une ligne de commande", () => {
    expect(MAX_ORDER_QUANTITY).toBe(contract.MAX_ORDER_QUANTITY);
  });
});
