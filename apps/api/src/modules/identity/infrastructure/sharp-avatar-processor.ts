import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import sharp, { type Metadata } from "sharp";
import type { AvatarProcessor } from "../application/ports.js";
import {
  AVATAR_RULES,
  checkAvatarDimensions,
  checkAvatarUpload,
  checkProcessedAvatar,
  type ProcessedAvatar,
} from "../domain/avatar.js";
import { IdentityError } from "../domain/identity-error.js";

/** Pixels décodés au plus (≈ 40 mégapixels) : un petit fichier qui annonce une image géante est refusé avant. */
const MAX_INPUT_PIXELS = 40_000_000;
/** Recadrages en même temps au plus pour toute l'API (le calcul occupe un cœur). */
const MAX_CONCURRENT = 2;
const TIMEOUT_SECONDS = 15;

let active = 0;
const waiting: (() => void)[] = [];
async function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await work();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

const unreadable = () =>
  new IdentityError(
    "PHOTO_INVALIDE",
    "photo refusée : fichier illisible (JPEG, PNG ou WebP attendu)",
  );
const tooBig = () =>
  new IdentityError("PHOTO_INVALIDE", "photo refusée : image trop grande (40 mégapixels au plus)");

/**
 * Photo de profil avec sharp (libvips), S7.5-T08 : format reconnu par le contenu ET par le décodeur ; première image
 * seulement ; orientation appliquée ; carré de 256 px recadré au centre ; WebP sans AUCUNE métadonnée (sharp n'en
 * écrit pas par défaut) ; deux recadrages à la fois au plus, 15 secondes au plus chacun.
 */
@Injectable()
export class SharpAvatarProcessor implements AvatarProcessor {
  process(bytes: Uint8Array): Promise<ProcessedAvatar> {
    const format = checkAvatarUpload(bytes);
    return oneAtATime(() => this.encode(bytes, format));
  }

  private async encode(bytes: Uint8Array, format: string): Promise<ProcessedAvatar> {
    const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", pages: 1 } as const;
    let meta: Metadata;
    try {
      meta = await sharp(input, options).metadata();
    } catch (error) {
      throw isPixelLimit(error) ? tooBig() : unreadable();
    }
    if (meta.format !== format || !meta.width || !meta.height) throw unreadable();
    checkAvatarDimensions(meta.width, meta.height);
    try {
      const out = await sharp(input, options)
        .rotate()
        .resize({
          width: AVATAR_RULES.side,
          height: AVATAR_RULES.side,
          fit: "cover",
          position: "centre",
        })
        .webp({ quality: 80, effort: 4 })
        .timeout({ seconds: TIMEOUT_SECONDS })
        .toBuffer();
      const avatar: ProcessedAvatar = {
        image: new Uint8Array(out),
        sha256: createHash("sha256").update(out).digest("hex"),
      };
      checkProcessedAvatar(avatar);
      return avatar;
    } catch (error) {
      if (error instanceof IdentityError) throw error;
      if (isPixelLimit(error)) throw tooBig();
      if (error instanceof Error && /timeout/i.test(error.message)) {
        throw new IdentityError("PHOTO_INVALIDE", "photo refusée : trop longue à traiter");
      }
      throw unreadable();
    }
  }
}

function isPixelLimit(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}
