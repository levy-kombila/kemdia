import { IdentityError } from "./identity-error.js";

/**
 * Photo de profil (S7.5-T08, ADR-0055). Règles pures, sans framework ni base.
 *
 * - Fichier reçu : JPEG, PNG ou WebP, reconnu par son CONTENU (premiers octets), 5 Mo au plus, 200 px au moins.
 * - Jamais gardé tel quel : l'infrastructure le recadre en carré de 256 px, en WebP SANS métadonnées (position GPS,
 *   appareil). Seul ce résultat est servi, et seulement au titulaire du compte.
 */

/** Mêmes valeurs que AVATAR_LIMITS du contrat (vérifié par un test d'alignement). */
export const AVATAR_RULES = {
  maxUploadBytes: 5 * 1024 * 1024,
  minSide: 200,
  side: 256,
  maxStoredBytes: 256 * 1024,
} as const;

export type AvatarFormat = "jpeg" | "png" | "webp";

/** Photo prête à être rangée. */
export interface ProcessedAvatar {
  image: Uint8Array;
  sha256: string;
}

const invalid = (message: string) => new IdentityError("PHOTO_INVALIDE", message);

/** Format d'après les premiers octets ; un fichier HTML ou SVG renommé en .jpg est refusé avant d'être décodé. */
export function sniffAvatarFormat(bytes: Uint8Array): AvatarFormat | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => at(i) === b)) return "png";
  const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  return null;
}

/** Taille et format du fichier reçu. */
export function checkAvatarUpload(bytes: Uint8Array): AvatarFormat {
  if (bytes.length > AVATAR_RULES.maxUploadBytes) throw invalid("photo refusée : 5 Mo au plus");
  const format = bytes.length ? sniffAvatarFormat(bytes) : null;
  if (!format) throw invalid("photo refusée : seuls les fichiers JPEG, PNG ou WebP sont acceptés");
  return format;
}

/** Dimensions de l'image décodée. */
export function checkAvatarDimensions(width: number, height: number): void {
  if (Math.min(width, height) < AVATAR_RULES.minSide) {
    throw invalid(`photo refusée : ${AVATAR_RULES.minSide} pixels au moins de chaque côté`);
  }
}

/** Garde-fou avant l'écriture : un WebP de taille raisonnable. */
export function checkProcessedAvatar(avatar: ProcessedAvatar): void {
  if (
    sniffAvatarFormat(avatar.image) !== "webp" ||
    avatar.image.length > AVATAR_RULES.maxStoredBytes ||
    !/^[0-9a-f]{64}$/.test(avatar.sha256)
  ) {
    throw new Error("réencodage de la photo de profil : résultat inattendu");
  }
}

/** Version publiée dans le compte (16 premiers caractères de l'empreinte) : l'adresse de la photo change avec elle. */
export function avatarVersionOf(sha256: string): string {
  return sha256.slice(0, 16);
}

export function noAvatar(): IdentityError {
  return new IdentityError("PHOTO_ABSENTE", "pas de photo de profil");
}
