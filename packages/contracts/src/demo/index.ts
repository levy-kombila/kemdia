import { createHash } from "node:crypto";
import data from "./catalogue-demo.json" with { type: "json" };

/**
 * Catalogue de démonstration (112 catégories, 50 produits, aucune donnée personnelle) et ses identifiants.
 * Utilisé par l'import de l'API (`pnpm --filter @kemdia/api db:seed`) et par le mode « fichier » du site
 * (jusqu'au S3-T07) : les deux donnent les MÊMES identifiants, donc un panier reste valable d'un mode à l'autre.
 * Côté serveur uniquement (node:crypto).
 */

export interface DemoCatalog {
  categories: {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    icon: string;
    image: string | null;
  }[];
  products: {
    id: string;
    slug: string;
    title: string;
    description: string;
    price: number;
    oldPrice: number | null;
    brand: string | null;
    categoryId: string;
    images: string[];
    stock: number;
    rating: number;
    reviewCount: number;
    isFeatured: boolean;
    isBestseller: boolean;
    isNew: boolean;
    color: string | null;
  }[];
}

export const demoCatalog: DemoCatalog = data;

/** Espace de noms des UUID v5 de la démonstration (valeur fixe, propre à Kemdia). */
export const DEMO_NAMESPACE = "6f1c2a8e-4b7d-5e3f-9a1b-2c3d4e5f6a7b";

/** UUID v5 (RFC 9562) : même nom → même identifiant, sur toutes les machines. */
export function uuidV5(name: string, namespace = DEMO_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  hash[6] = ((hash[6] as number) & 0x0f) | 0x50;
  hash[8] = ((hash[8] as number) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Identifiants publics des données de démonstration, calculés à partir des adresses (stables). */
export const demoIds = {
  category: (slug: string) => uuidV5(`categorie:${slug}`),
  product: (slug: string) => uuidV5(`produit:${slug}`),
  /** Chaque produit de démonstration a une seule variante (sa couleur). */
  variant: (slug: string) => uuidV5(`variante:${slug}`),
  sku: (slug: string) =>
    `KMD-${createHash("sha1").update(slug).digest("hex").slice(0, 10).toUpperCase()}`,
};
