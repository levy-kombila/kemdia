import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  ProductImageOrderRequestSchema,
  ProductImageParamsSchema,
  VendorProductIdParamsSchema,
  type ProductImageOrderRequest,
  type VendorProduct,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import { sendImage } from "../../catalog/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { BusinessException } from "../../../http/business-exception.js";
import { VendorProductService } from "../application/vendor-product.service.js";
import { presentVendorProduct } from "./vendor-product.presenter.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

type ProductParams = { productId: string };
type ImageParams = { productId: string; imageId: string };

/** Corps de l'envoi : le fichier, lu en binaire par le parseur dédié (configure-app.ts, `isImageUpload`). */
function uploadedBytes(req: Request): Uint8Array {
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new BusinessException(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      "Envoyez le fichier de la photo lui-même, en JPEG, PNG ou WebP (en-tête Content-Type image/jpeg, image/png ou image/webp)",
      "FORMAT_IMAGE_INVALIDE",
    );
  }
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}

/**
 * Photos des produits de la boutique du compte connecté (`/api/v1/vendors/products/{id}/images`, S6-T04, ADR-0035).
 * Mêmes droits que les produits : rôle « vendeur » ET boutique active ; un produit d'une autre boutique est introuvable.
 */
@Controller("vendors/products/:productId/images")
@Authorize("vendor")
@AccountRateLimit(60)
export class VendorProductImageController {
  constructor(private readonly products: VendorProductService) {}

  /** Ajoute une photo (corps = le fichier) : le produit repasse en modération. 201 : le produit à jour. */
  @Post()
  @Header("Cache-Control", "no-store")
  // Réencodage coûteux : 20 photos par minute et par compte
  @AccountRateLimit(20)
  async add(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    const bytes = uploadedBytes(req);
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.addImage(session.account.id, params.productId, bytes, auditContextOf(req)),
      ),
    );
  }

  /** Nouvel ordre des photos (la première est la principale), sans nouvelle modération. */
  @Put()
  @Header("Cache-Control", "no-store")
  async reorder(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
    @Body({ schema: ProductImageOrderRequestSchema }) body: ProductImageOrderRequest,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.reorderImages(
          session.account.id,
          params.productId,
          body.images,
          auditContextOf(req),
        ),
      ),
    );
  }

  /** La grande image, quel que soit le statut du produit (aperçu du vendeur). Jamais mise en cache partagé. */
  @Get(":imageId")
  async image(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ProductImageParamsSchema }) params: ImageParams,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const image = await withVendorsErrors(() =>
      this.products.image(session.account.id, params.productId, params.imageId, "large"),
    );
    sendImage(req, res, image, "large", "private, no-store");
  }

  /** Retire une photo, tout de suite : elle est effacée et n'est plus jamais servie. */
  @Delete(":imageId")
  @Header("Cache-Control", "no-store")
  async remove(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ProductImageParamsSchema }) params: ImageParams,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.removeImage(
          session.account.id,
          params.productId,
          params.imageId,
          auditContextOf(req),
        ),
      ),
    );
  }
}
