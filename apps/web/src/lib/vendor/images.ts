// Sous-chemin « constants » : ce fichier est aussi lu par le navigateur (pas de Zod)
import { PRODUCT_IMAGE_LIMITS, PRODUCT_IMAGE_TYPES } from "@kemdia/contracts/constants";
import { isVendorImage, parseVendorImageFile } from "@/lib/catalog/vendor-image";

/** Types de photo acceptés à l'envoi (mêmes que l'API, ADR-0035). */
export type UploadType = (typeof PRODUCT_IMAGE_TYPES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

/** Fichier envoyé au plus (5 Mo, comme l'API) : au-delà, le relais du site refuse sans rien transmettre. */
export const MAX_UPLOAD_BYTES = PRODUCT_IMAGE_LIMITS.maxUploadBytes;
/** Plus grand côté après réduction dans le navigateur : celui de la grande image de l'API (1 600 px). */
export const REDUCED_SIDE = PRODUCT_IMAGE_LIMITS.largeSide;
export const MAX_PHOTOS = PRODUCT_IMAGE_LIMITS.maxPerProduct;
export const MIN_SIDE = PRODUCT_IMAGE_LIMITS.minSide;

/**
 * Type réel d'un fichier, lu dans ses premiers octets (jamais le nom ni le type annoncé) : JPEG, PNG ou WebP, sinon
 * `null`. L'API refait la même vérification puis décode et réencode la photo.
 */
export function sniffUploadType(bytes: Uint8Array): UploadType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

/**
 * Aperçu d'une photo de SON produit (S6-T06) : relais de l'espace vendeur, qui présente le jeton de session à l'API.
 * L'adresse publique (`/images/v/…`) ne sert que les produits validés. `null` : pas une photo de vendeur.
 */
export function vendorPhotoSrc(productId: string, path: string): string | null {
  if (!isUuid(productId) || !isVendorImage(path)) return null;
  const parsed = parseVendorImageFile(path.slice("/images/v/".length));
  return parsed ? `/vendeur/produits/${productId.toLowerCase()}/photos/${parsed.imageId}` : null;
}

/** Identifiant d'une photo à partir de son adresse publique (`/images/v/<id>.webp`), ou `null`. */
export function photoIdOf(path: string): string | null {
  if (!isVendorImage(path)) return null;
  return parseVendorImageFile(path.slice("/images/v/".length))?.imageId ?? null;
}
