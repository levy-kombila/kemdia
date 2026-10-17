import { Injectable } from "@nestjs/common";
import sharp, { type Metadata } from "sharp";
import type { KycImageProcessor } from "../application/ports.js";
import { VendorsError } from "../domain/vendors-error.js";

/**
 * Photos des pièces (S6-T08, ADR-0039), même méthode que les photos de produits (S6-T04) :
 * - format reconnu par les premiers octets (JPEG, PNG, WebP) ET par le décodeur, qui doivent concorder ;
 * - 40 mégapixels au plus avant tout décodage (« bombe de décompression ») ; 300 px au moins de chaque côté (lisible) ;
 * - première image seulement, orientation appliquée, 1 600 px au plus, WebP SANS métadonnée (ni EXIF ni GPS) ;
 * - deux réencodages à la fois au plus pour la vérification, 15 secondes au plus chacun.
 */
const MAX_INPUT_PIXELS = 40_000_000;
const MIN_SIDE = 300;
const MAX_SIDE = 1600;
const TIMEOUT_SECONDS = 15;
const MAX_CONCURRENT = 2;
/** Au-delà, refus tout de suite (« réessayez ») plutôt qu'une file qui grossit en mémoire (relecture S6-T08). */
const MAX_WAITING = 8;

type Format = "jpeg" | "png" | "webp";

function formatOf(bytes: Uint8Array): Format | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  )
    return "png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return "webp";
  return null;
}

const unreadable = () =>
  new VendorsError(
    "FORMAT_IMAGE_INVALIDE",
    "photo refusée : fichier illisible (JPEG, PNG ou WebP attendu)",
  );
const tooBig = () =>
  new VendorsError(
    "IMAGE_TROP_GRANDE",
    "photo refusée : image trop grande (40 mégapixels au plus)",
  );

let active = 0;
const waiting: (() => void)[] = [];
async function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT && waiting.length >= MAX_WAITING) {
    throw new VendorsError(
      "KYC_INDISPONIBLE",
      "beaucoup de photos en cours de traitement : réessayez dans quelques secondes",
    );
  }
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await work();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

@Injectable()
export class SharpKycImageProcessor implements KycImageProcessor {
  process(bytes: Uint8Array): Promise<Uint8Array> {
    const format = formatOf(bytes);
    if (!format) return Promise.reject(unreadable());
    return oneAtATime(() => this.encode(bytes, format));
  }

  private async encode(bytes: Uint8Array, format: Format): Promise<Uint8Array> {
    const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", pages: 1 } as const;
    let meta: Metadata;
    try {
      meta = await sharp(input, options).metadata();
    } catch (error) {
      throw isPixelLimit(error) ? tooBig() : unreadable();
    }
    if (meta.format !== format || !meta.width || !meta.height) throw unreadable();
    if (Math.min(meta.width, meta.height) < MIN_SIDE) {
      throw new VendorsError(
        "IMAGE_TROP_PETITE",
        `photo trop petite pour être lue : ${MIN_SIDE} pixels au moins de chaque côté`,
      );
    }
    try {
      const out = await sharp(input, options)
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .timeout({ seconds: TIMEOUT_SECONDS })
        .toBuffer();
      return new Uint8Array(out);
    } catch (error) {
      if (isPixelLimit(error)) throw tooBig();
      if (error instanceof Error && /timeout/i.test(error.message)) {
        throw new VendorsError("IMAGE_TROP_GRANDE", "photo refusée : trop longue à traiter");
      }
      throw unreadable();
    }
  }
}

function isPixelLimit(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}
