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
  type UploadFormat,
} from "../domain/product-image.js";

/**
 * Plus grand nombre de pixels décodés (≈ 40 mégapixels, la photo d'un très bon téléphone) : au-delà, refus avant de
 * tout décoder. Un petit fichier qui annonce une image gigantesque (« bombe de décompression ») ne remplit pas la mémoire.
 */
const MAX_INPUT_PIXELS = 40_000_000;
/** Réencodages en même temps au plus, pour toute l'API (le calcul occupe un cœur) : les autres attendent leur tour. */
const MAX_CONCURRENT = 2;
/** Au-delà, le réencodage est abandonné (fichier piégé très coûteux à décoder). */
const TIMEOUT_SECONDS = 15;

/** File d'attente minimale : `MAX_CONCURRENT` tâches à la fois. */
class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(private readonly max: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
const slots = new Semaphore(MAX_CONCURRENT);

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
 *   (ni EXIF, ni position GPS, ni profil) : rien de ce que le téléphone a mis dans le fichier n'est servi ;
 * - la vignette est tirée de la GRANDE image déjà encodée, celle que voit la modération : elle ne peut pas montrer
 *   autre chose (relecture S6-T04) ;
 * - deux réencodages à la fois au plus dans toute l'API, 15 secondes au plus chacun.
 */
@Injectable()
export class SharpImageProcessor implements ImageProcessor {
  process(bytes: Uint8Array): Promise<ProcessedImage> {
    const format = checkUpload(bytes);
    return slots.run(() => this.encode(bytes, format));
  }

  private async encode(bytes: Uint8Array, format: UploadFormat): Promise<ProcessedImage> {
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
      const encode = (source: Buffer, side: number, quality: number) =>
        sharp(source, options)
          .rotate()
          .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
          .webp({ quality, effort: 4 })
          .timeout({ seconds: TIMEOUT_SECONDS })
          .toBuffer({ resolveWithObject: true });
      const large = await encode(input, PRODUCT_IMAGE_RULES.largeSide, 80);
      const small = await encode(large.data, PRODUCT_IMAGE_RULES.smallSide, 75);
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
      throw failure(error);
    }
  }
}

function isPixelLimit(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}

function failure(error: unknown): CatalogError {
  if (isPixelLimit(error)) return tooBig();
  if (error instanceof Error && /timeout/i.test(error.message)) {
    return new CatalogError("IMAGE_TROP_GRANDE", "photo refusée : trop longue à traiter");
  }
  return unreadable();
}
