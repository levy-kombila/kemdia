import { CatalogError } from "./catalog-error.js";
import { MAX_IMAGES } from "./product.js";

/**
 * Photos des produits des vendeurs (S6-T04, ADR-0035). Règles pures, sans framework ni base.
 *
 * - Fichier reçu : JPEG, PNG ou WebP, reconnu par son CONTENU (premiers octets), 5 Mo au plus.
 * - Il n'est jamais gardé tel quel : l'infrastructure le réencode en WebP sans métadonnées (position GPS, appareil),
 *   en deux tailles. Seul ce résultat est servi.
 * - Adresse sur le site : « /images/v/<id>.webp », rangée dans `Product.images` comme les photos du catalogue Kemdia ;
 *   le reste du code (cartes, panier, commandes) n'a donc rien à changer.
 */

/** Mêmes valeurs que PRODUCT_IMAGE_LIMITS du contrat (vérifié par un test d'alignement). */
export const PRODUCT_IMAGE_RULES = {
  maxUploadBytes: 5 * 1024 * 1024,
  maxPerProduct: MAX_IMAGES,
  minSide: 200,
  largeSide: 1600,
  smallSide: 480,
  maxStoredBytes: 2 * 1024 * 1024,
} as const;

export type UploadFormat = "jpeg" | "png" | "webp";
export type ImageSize = "large" | "small";

/** Résultat du réencodage, prêt à être rangé. */
export interface ProcessedImage {
  large: Uint8Array;
  small: Uint8Array;
  width: number;
  height: number;
  sha256: string;
}

const invalidFormat = () =>
  new CatalogError(
    "FORMAT_IMAGE_INVALIDE",
    "photo refusée : seuls les fichiers JPEG, PNG ou WebP sont acceptés",
  );

/**
 * Format d'après les premiers octets (« nombre magique »), jamais d'après un nom ou un type annoncé : un fichier HTML
 * ou SVG renommé en .jpg est refusé avant d'être décodé.
 */
export function sniffFormat(bytes: Uint8Array): UploadFormat {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => at(i) === b)) return "png";
  const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  throw invalidFormat();
}

/** Vérifie la taille du fichier reçu puis son format. */
export function checkUpload(bytes: Uint8Array): UploadFormat {
  if (bytes.length === 0) throw invalidFormat();
  if (bytes.length > PRODUCT_IMAGE_RULES.maxUploadBytes) {
    throw new CatalogError("IMAGE_TROP_GRANDE", "photo refusée : 5 Mo au plus");
  }
  return sniffFormat(bytes);
}

/** Dimensions de l'image décodée : ni minuscule, ni démesurée (décodée par l'infrastructure). */
export function checkDimensions(width: number, height: number): void {
  if (Math.min(width, height) < PRODUCT_IMAGE_RULES.minSide) {
    throw new CatalogError(
      "IMAGE_TROP_PETITE",
      `photo refusée : ${PRODUCT_IMAGE_RULES.minSide} pixels au moins de chaque côté`,
    );
  }
}

/** Le résultat du réencodage est-il bien un WebP de taille raisonnable ? (garde-fou avant l'écriture) */
export function checkProcessed(image: ProcessedImage): void {
  for (const bytes of [image.large, image.small]) {
    if (sniffFormatOrNull(bytes) !== "webp" || bytes.length > PRODUCT_IMAGE_RULES.maxStoredBytes) {
      throw new Error("réencodage de la photo : résultat inattendu");
    }
  }
  const side = PRODUCT_IMAGE_RULES.largeSide;
  if (image.width < 1 || image.height < 1 || image.width > side || image.height > side) {
    throw new Error("réencodage de la photo : dimensions inattendues");
  }
}

function sniffFormatOrNull(bytes: Uint8Array): UploadFormat | null {
  try {
    return sniffFormat(bytes);
  } catch {
    return null;
  }
}

const VENDOR_PATH =
  /^\/images\/v\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;

/** Adresse sur le site d'une photo de vendeur (la grande ; la vignette s'en déduit côté site). */
export function vendorImagePath(imageId: string): string {
  return `/images/v/${imageId.toLowerCase()}.webp`;
}

/** Identifiant d'une photo de vendeur d'après son adresse, ou `null` (photo du catalogue Kemdia). */
export function vendorImageId(path: string): string | null {
  return VENDOR_PATH.exec(path)?.[1] ?? null;
}

/** Une photo de plus : 10 au plus par produit. */
export function withAddedImage(images: readonly string[], imageId: string): string[] {
  if (images.length >= PRODUCT_IMAGE_RULES.maxPerProduct) {
    throw new CatalogError(
      "TROP_DE_PHOTOS",
      `${PRODUCT_IMAGE_RULES.maxPerProduct} photos au plus par produit : retirez-en une d'abord`,
    );
  }
  return [...images, vendorImagePath(imageId)];
}

/** La photo retirée doit appartenir au produit. */
export function withoutImage(images: readonly string[], imageId: string): string[] {
  const path = vendorImagePath(imageId);
  if (!images.includes(path)) throw photoNotFound();
  return images.filter((p) => p !== path);
}

/** Nouvel ordre : exactement les mêmes photos, chacune une fois. */
export function reordered(images: readonly string[], imageIds: readonly string[]): string[] {
  const next = imageIds.map(vendorImagePath);
  const same =
    next.length === images.length &&
    new Set(next).size === next.length &&
    next.every((p) => images.includes(p));
  if (!same) {
    throw new CatalogError(
      "PRODUIT_INVALIDE",
      "nouvel ordre : donnez toutes les photos du produit, chacune une fois",
    );
  }
  return next;
}

export function photoNotFound(): CatalogError {
  return new CatalogError("PHOTO_INTROUVABLE", "photo introuvable");
}
