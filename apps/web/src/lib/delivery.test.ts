import { describe, expect, it } from "vitest";
import { CITIES, ZONES, deliveryWindow, estimateDelivery, formatDelay, getCity } from "./delivery";

describe("zone de couverture", () => {
  it("ne contient que des villes du Gabon avec une zone valide", () => {
    expect(CITIES.length).toBeGreaterThan(10);
    for (const c of CITIES) expect(ZONES[c.zone]).toBeDefined();
    expect(getCity("libreville")?.name).toBe("Libreville");
    expect(getCity("douala")).toBeUndefined();
  });
});

describe("estimateDelivery", () => {
  it("Libreville : livraison offerte (zone 1, frais de base 0)", () => {
    const e = estimateDelivery("libreville", 10000)!;
    expect(e.fee).toBe(0);
    expect(e.isFree).toBe(true);
  });
  it("Franceville : frais de zone + surcharge locale sous le seuil", () => {
    const e = estimateDelivery("franceville", 10000)!;
    expect(e.fee).toBe(2000 + 500);
    expect(e.remainingForFree).toBe(40000);
  });
  it("gratuit au-delà du seuil de la zone", () => {
    expect(estimateDelivery("port-gentil", 50000)!.fee).toBe(0);
    expect(estimateDelivery("makokou", 99999)!.fee).toBe(4000);
  });
  it("ville inconnue → null ; sous-total négatif traité comme 0", () => {
    expect(estimateDelivery("inconnue", 1000)).toBeNull();
    expect(estimateDelivery("oyem", -500)!.remainingForFree).toBe(75000);
  });
});

describe("formatDelay", () => {
  it("affiche en heures pour 1–2 jours", () => expect(formatDelay(1, 2)).toBe("24–48 h"));
  it("affiche en jours sinon", () => expect(formatDelay(4, 7)).toBe("4 à 7 jours"));
});

describe("deliveryWindow", () => {
  it("saute le dimanche", () => {
    // samedi 10 octobre 2026 + 1 jour ouvré → lundi 12
    expect(deliveryWindow(new Date(2026, 9, 10), 1, 1)).toBe("lun. 12 oct.");
  });
  it("affiche une fenêtre de dates", () => {
    // lundi 5 octobre 2026, zone 1 (1 à 2 jours)
    expect(deliveryWindow(new Date(2026, 9, 5), 1, 2)).toBe("mar. 6 oct. – mer. 7 oct.");
  });
});
