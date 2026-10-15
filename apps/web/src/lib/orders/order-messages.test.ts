import { COUPON_ERROR_CODES, ORDER_ERROR_CODES, ORDER_STATUSES } from "@kemdia/contracts/constants";
import { describe, expect, it } from "vitest";
import { isCouponCode, orderMessage, paymentFailureLabel, statusLabel } from "./order-messages";

describe("messages des commandes (S5-T07)", () => {
  it("chaque code de commande et de coupon du contrat a un message en français", () => {
    for (const code of [...ORDER_ERROR_CODES, ...COUPON_ERROR_CODES]) {
      expect(orderMessage(code), code).toMatch(/\S/);
    }
    expect(isCouponCode("COUPON_EXPIRE")).toBe(true);
    expect(isCouponCode("PRIX_MODIFIE")).toBe(false);
  });

  it("statuts et raisons d'échec en clair ; raison inconnue : texte neutre", () => {
    for (const status of ORDER_STATUSES) expect(statusLabel(status)).toMatch(/\S/);
    expect(paymentFailureLabel("solde_insuffisant")).toBe("solde insuffisant");
    expect(paymentFailureLabel("<b>inconnue</b>")).toBe("paiement non abouti");
    expect(paymentFailureLabel(null)).toBe("paiement non abouti");
  });
});
