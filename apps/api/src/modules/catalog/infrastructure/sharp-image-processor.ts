import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import sharp, { type Metadata } from "sharp";
import type { ImageProcessor } from "../application/ports.js";
import { CatalogError } from "../domain/catalog-error.js";
import {
  PRODUCT_IMAGE_RULES,
  checkDimensions,
  checkProcessed,
  checkUpload,
  type ProcessedImage,
} from "../domain/product-image.js";

/**
 * Plus grand nombre de pixels décodés (≈ 40 mégapixels, la photo d'un très bon téléphone) : au-delà, refus avant de
 * tout décoder. Un petit fichier qui annonce une image gigantesque (« bombe de décompression ») ne remplit pas la mémoire.
 */
const MAX_INPUT_PIXELS = 40_000_000;

const tooBig = () =>
  new CatalogError(
    "IMAGE_TROP_GRANDE",
    "photo refusée : image trop grande (40 mégapixels au plus)",
  );
const unreadable = () =>
  new CatalogError(
    "FORMAT_IMAGE_INVALIDE",
    "photo refusée : fichier illisible (JPEG, PNG ou WebP attendu)",
  );

/**
 * Réencodage avec sharp (libvips), S6-T04 :
 * - format reconnu par le contenu (`checkUpload`) ET par le décodeur, qui doivent concorder ;
 * - première image seulement (un WebP animé devient une photo fixe), orientation appliquée puis retirée ;
 * - WebP en deux tailles (1 600 et 480 px au plus, jamais agrandies) ; sharp n'écrit AUCUNE métadonnée par défaut
 *   (ni EXIF, ni position GPS, ni profil) : rien de ce que le téléphone a mis dans le fichier n'est servi.
 */
@Injectable()
export class SharpImageProcessor implements ImageProcessor {
  async process(bytes: Uint8Array): Promise<ProcessedImage> {
    const format = checkUpload(bytes);
    const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", pages: 1 } as const;
    let meta: Metadata;
    try {
      meta = await sharp(input, options).metadata();
    } catch (error) {
      throw isPixelLimit(error) ? tooBig() : unreadable();
    }
    if (meta.format !== format || !meta.width || !meta.height) throw unreadable();
    // Orientation EXIF : un portrait pris de côté a ses dimensions inversées une fois redressé
    const turned = (meta.orientation ?? 1) >= 5;
    checkDimensions(turned ? meta.height : meta.width, turned ? meta.width : meta.height);
    try {
      const encode = (side: number, quality: number) =>
        sharp(input, options)
          .rotate()
          .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
          .webp({ quality, effort: 4 })
          .toBuffer({ resolveWithObject: true });
      const [large, small] = await Promise.all([
        encode(PRODUCT_IMAGE_RULES.largeSide, 80),
        encode(PRODUCT_IMAGE_RULES.smallSide, 75),
      ]);
      const image: ProcessedImage = {
        large: new Uint8Array(large.data),
        small: new Uint8Array(small.data),
        width: large.info.width,
        height: large.info.height,
        sha256: createHash("sha256").update(large.data).digest("hex"),
      };
      checkProcessed(image);
      return image;
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      throw isPixelLimit(error) ? tooBig() : unreadable();
    }
  }
}

function isPixelLimit(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}
