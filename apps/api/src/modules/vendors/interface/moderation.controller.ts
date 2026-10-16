import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  ModerationListParamsSchema,
  ProductApprovalSchema,
  type ProductApproval,
  ProductModerationReasonSchema,
  VendorProductIdParamsSchema,
  type ModerationListParams,
  type ModerationProduct,
  type ModerationProductPage,
  type ProductModerationReason,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { ProductModerationService } from "../application/product-moderation.service.js";
import type { ModerationDecision } from "../../catalog/index.js";
import {
  decodeProductCursor,
  encodeProductCursor,
  presentModerationProduct,
  statusFromApi,
} from "./vendor-product.presenter.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

type ProductParams = { productId: string };

/**
 * Modération des produits des vendeurs (`/api/v1/moderation/products`, S6-T02, ADR-0033 ; BR-003). Modérateurs et
 * administrateurs, double authentification confirmée depuis moins de 15 minutes (S6-T03), 30 requêtes par minute par adresse et par compte, jamais mis en
 * cache ; chaque décision au journal d'audit. Écrans plus tard au S6.
 */
@Controller("moderation/products")
@Authorize("moderator", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class ModerationController {
  constructor(private readonly moderation: ProductModerationService) {}

  /** File : produits en attente (par défaut), de la demande la plus ancienne à la plus récente. */
  @Get()
  @Header("Cache-Control", "no-store")
  async queue(
    @Query({ schema: ModerationListParamsSchema }) query: ModerationListParams,
  ): Promise<ModerationProductPage> {
    const page = await this.moderation.queue({
      status: statusFromApi(query.status),
      limit: query.limit,
      after: query.after ? decodeProductCursor(query.after) : undefined,
    });
    return {
      items: page.items.map(presentModerationProduct),
      nextCursor: page.next ? encodeProductCursor(page.next) : null,
    };
  }

  @Get(":productId")
  @Header("Cache-Control", "no-store")
  async get(
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
  ): Promise<ModerationProduct> {
    return presentModerationProduct(
      await withVendorsErrors(() => this.moderation.get(params.productId)),
    );
  }

  /** Valide un produit en attente : il devient visible des clients (si sa boutique n'est pas suspendue). */
  @Post(":productId/approve")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  approve(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
    @Body({ schema: ProductApprovalSchema }) body: ProductApproval,
    @Req() req: Request,
  ): Promise<ModerationProduct> {
    return this.decide(session, params.productId, "approve", null, body.submittedAt, req);
  }

  /** Refuse un produit en attente, avec un motif montré au vendeur. */
  @Post(":productId/reject")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  reject(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
    @Body({ schema: ProductModerationReasonSchema }) body: ProductModerationReason,
    @Req() req: Request,
  ): Promise<ModerationProduct> {
    return this.decide(session, params.productId, "reject", body.reason, body.submittedAt, req);
  }

  private async decide(
    session: AuthenticatedSession,
    productId: string,
    decision: ModerationDecision,
    reason: string | null,
    seenSubmittedAt: string,
    req: Request,
  ): Promise<ModerationProduct> {
    const actor = { accountId: session.account.id, roles: session.account.roles };
    return presentModerationProduct(
      await withVendorsErrors(() =>
        this.moderation.decide(
          actor,
          productId,
          decision,
          reason,
          new Date(seenSubmittedAt),
          auditContextOf(req),
        ),
      ),
    );
  }
}
