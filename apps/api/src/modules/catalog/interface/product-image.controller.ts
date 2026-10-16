import { Controller, Get, HttpStatus, Param, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { PublicProductImageParamsSchema } from "@kemdia/contracts";
import { BusinessException } from "../../../http/business-exception.js";
import type { StoredImage } from "../application/ports.js";
import { VendorCatalog } from "../application/vendor-catalog.service.js";
import { CatalogError } from "../domain/catalog-error.js";
import type { ImageSize } from "../domain/product-image.js";

/**
 * Même durée que le catalogue : 60 s, puis 5 min de copie ancienne pendant la mise à jour. Une photo retirée ou un
 * produit caché (modération, boutique suspendue) cesse donc d'être servi en 6 minutes au plus.
 */
const CACHE_PUBLIC = "public, max-age=60, stale-while-revalidate=300";

/** Envoie une photo WebP rangée (aussi utilisé par le module vendors pour le vendeur et la modération). */
export function sendImage(
  req: Request,
  res: Response,
  image: StoredImage,
  size: ImageSize,
  cacheControl: string,
): void {
  const etag = `"${image.sha256.slice(0, 32)}-${size}"`;
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("ETag", etag);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.headers["if-none-match"] === etag) {
    res.status(HttpStatus.NOT_MODIFIED).end();
    return;
  }
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Content-Length", String(image.bytes.byteLength));
  res.status(HttpStatus.OK).end(Buffer.from(image.bytes));
}

/** Photo introuvable (ou pas publique) : 404, même réponse dans tous les cas (rien ne dit si elle existe). */
export function imageNotFound(error: unknown): never {
  if (error instanceof CatalogError && error.code === "PHOTO_INTROUVABLE") {
    throw new BusinessException(HttpStatus.NOT_FOUND, "Photo introuvable", "PHOTO_INTROUVABLE");
  }
  throw error;
}

/**
 * Photos publiques des produits des vendeurs (`GET /api/v1/product-images/{id}/{large|small}`, S6-T04, ADR-0035).
 * Appelé par le relais du site (`/images/v/…`). Seules les photos des produits VISIBLES sont servies.
 */
@Controller("product-images")
export class ProductImageController {
  constructor(private readonly catalog: VendorCatalog) {}

  @Get(":imageId/:size")
  // Le site relaie pour tous ses visiteurs (clé interne, exemptée) ; un appel direct reste limité par adresse
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async image(
    @Param({ schema: PublicProductImageParamsSchema }) params: { imageId: string; size: ImageSize },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const image = await this.catalog
      .publicImage(params.imageId, params.size)
      .catch((error: unknown) => imageNotFound(error));
    sendImage(req, res, image, params.size, CACHE_PUBLIC);
  }
}
