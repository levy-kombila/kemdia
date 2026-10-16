import type { CategoryNode } from "@kemdia/contracts";
import { parseVendorImageFile, isVendorImage } from "@/lib/catalog/vendor-image";

/**
 * Photo d'un produit vue par la modération (S6-T05) : jamais l'adresse publique (elle ne sert que les produits
 * validés), mais le relais de l'équipe, qui présente le jeton de session à l'API (rôle + 2FA vérifiés à chaque photo).
 * `null` : adresse qui n'est pas une photo de vendeur (rien n'est affiché).
 */
export function staffImageSrc(productId: string, path: string): string | null {
  if (!isVendorImage(path)) return null;
  const parsed = parseVendorImageFile(path.slice("/images/v/".length));
  return parsed ? `/equipe/moderation/${productId}/photos/${parsed.imageId}` : null;
}

/** Chemin lisible d'une catégorie (« Mode › Pagnes »), ou `null` si elle est introuvable dans l'arbre. */
export function categoryPathOf(tree: readonly CategoryNode[], id: string): string | null {
  const walk = (nodes: readonly CategoryNode[], trail: string[]): string[] | null => {
    for (const node of nodes) {
      const here = [...trail, node.name];
      if (node.id === id) return here;
      const found = walk(node.children, here);
      if (found) return found;
    }
    return null;
  };
  return walk(tree, [])?.join(" › ") ?? null;
}
