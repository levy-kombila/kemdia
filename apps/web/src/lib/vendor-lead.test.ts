import { describe, expect, it } from "vitest";
import { validateVendorLead, type VendorLead } from "./vendor-lead";

const lead: VendorLead = {
  fullName: "Paul Ondo",
  shopName: "Ondo Électronique",
  phone: "066 12 34 56",
  cityId: "port-gentil",
  category: "High-Tech",
  message: "",
};

describe("validateVendorLead", () => {
  it("accepte une demande complète", () => {
    expect(validateVendorLead(lead)).toEqual({});
  });
  it("refuse les champs invalides, dont le HTML dans le nom de boutique", () => {
    const e = validateVendorLead({
      ...lead,
      fullName: "Paul",
      shopName: "<b>x</b>",
      phone: "12",
      cityId: "",
      category: "Armes",
      message: "x".repeat(501),
    });
    expect(Object.keys(e).sort()).toEqual([
      "category",
      "cityId",
      "fullName",
      "message",
      "phone",
      "shopName",
    ]);
  });
});
