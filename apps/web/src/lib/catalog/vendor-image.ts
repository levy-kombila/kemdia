// Sous-chemin « constants » : utilisé par des composants du navigateur, il ne doit pas embarquer les schémas Zod
import { VENDOR_IMAGE_PATH_PATTERN } from "@kemdia/contracts/constants";

/**
 * Photos des produits des vendeurs (S6-T04, ADR-0035) : adresse « /images/v/<id>.webp » (grande image) ; la vignette
 * est « /images/v/<id>-480.webp ». Elles sont servies par le relais du site (app/images/v/[file]/route.ts), qui les
 * demande à l'API : jamais par l'optimiseur d'images de Next.js (qui les garderait 24 h, même retirées).
 */
export const isVendorImage = (src: string): boolean => VENDOR_IMAGE_PATH_PATTERN.test(src);

/** Vignette (480 px) d'une photo de vendeur ; toute autre adresse est rendue telle quelle. */
export const vendorThumbnail = (src: string): string =>
  isVendorImage(src) ? src.replace(/\.webp$/, "-480.webp") : src;

const FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(-480)?\.webp$/;

/** Nom de fichier demandé au relais → photo et taille, ou `null` (adresse inconnue). */
export function parseVendorImageFile(
  file: string,
): { imageId: string; size: "large" | "small" } | null {
  const match = FILE.exec(file);
  if (!match) return null;
  return { imageId: match[1]!, size: match[2] ? "small" : "large" };
}
