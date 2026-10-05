import { describe, expect, it } from "vitest";
import { whatsappShareUrl } from "./share";

describe("whatsappShareUrl", () => {
  it("construit un lien wa.me avec le texte encodé et le suivi de la source", () => {
    const link = whatsappShareUrl("https://kemdia.ga/produit/casque", "Casque & micro #1", 25000);
    expect(link.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(link.split("text=")[1]!);
    expect(text).toMatch(/Casque & micro #1 à 25\s000\sFCFA sur Kemdia/);
    expect(text).toContain(
      "https://kemdia.ga/produit/casque?utm_source=whatsapp&utm_medium=partage",
    );
    expect(link).not.toContain("&utm");
  });
});
