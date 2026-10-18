import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * S7-T03 (ADR-0042) : les liens « de masse » (cartes produits, rayons, bannière, menu des rayons) ne sont pas
 * préchargés automatiquement. Sur l'accueil, Next.js préchargeait ~30 pages au chargement : temps de calcul du
 * téléphone et données mobiles (3G) pris au moment où la page devient interactive.
 */
const MASS_LINK_FILES = [
  "product/ProductCard.tsx",
  "home/CategoryBubbles.tsx",
  "home/CategoryTiles.tsx",
  "home/Hero.tsx",
  "home/FlashSales.tsx",
  "home/SectionHeader.tsx",
  "layout/CategoryNav.tsx",
];

describe("liens sans préchargement automatique", () => {
  for (const file of MASS_LINK_FILES)
    it(`${file} : chaque <Link> porte prefetch={false}`, () => {
      const source = readFileSync(join(process.cwd(), "src/components", file), "utf8");
      // Un lien = `<Link` suivi d'un espace (pas `<LinkIcon`) ; l'attribut est le premier, juste après le nom
      const links = source.match(/<Link\s/g)?.length ?? 0;
      const withoutPrefetch = source.match(/<Link\s+prefetch=\{false\}/g)?.length ?? 0;
      expect(links).toBeGreaterThan(0);
      expect(withoutPrefetch).toBe(links);
    });
});
