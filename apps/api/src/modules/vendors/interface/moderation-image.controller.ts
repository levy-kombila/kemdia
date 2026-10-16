import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { ProductImageParamsSchema } from "@kemdia/contracts";
import { sendImage } from "../../catalog/index.js";
import { AccountRateLimit, Authorize } from "../../identity/index.js";
import { ProductModerationService } from "../application/product-moderation.service.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

/**
 * Photos d'un produit à modérer (`GET /api/v1/moderation/products/{id}/images/{imageId}`, S6-T04, ADR-0035) : la
 * modération voit ce qu'elle valide, quel que soit le statut du produit. Mêmes protections que la modération :
 * modérateur ou administrateur, double authentification confirmée depuis moins de 15 minutes. Jamais en cache partagé.
 */
@Controller("moderation/products/:productId/images")
@Authorize("moderator", { secondFactor: true })
// Une file de modération affiche plusieurs photos par produit : limite plus haute que les décisions
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@AccountRateLimit(120)
export class ModerationImageController {
  constructor(private readonly moderation: ProductModerationService) {}

  @Get(":imageId")
  async image(
    @Param({ schema: ProductImageParamsSchema }) params: { productId: string; imageId: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const image = await withVendorsErrors(() =>
      this.moderation.image(params.productId, params.imageId, "large"),
    );
    sendImage(req, res, image, "large", "private, no-store");
  }
}
