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
  ShopDecisionReasonSchema,
  ShopIdParamsSchema,
  ShopListParamsSchema,
  type AdminShop,
  type AdminShopPage,
  type ShopDecisionReason,
  type ShopListParams,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { ShopService } from "../application/shop.service.js";
import type { ShopDecision } from "../domain/shop.js";
import { decodeShopCursor, encodeShopCursor, presentAdminShop } from "./shop.presenter.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

/**
 * Examen des boutiques par l'administration (`/api/v1/admin/shops`, S6-T01, ADR-0032). Mêmes protections que les
 * autres routes d'administration (ADR-0020) : administrateur, double authentification confirmée depuis moins de 15 minutes (S6-T03), 30 requêtes par minute
 * par adresse et par compte, jamais mis en cache ; chaque décision au journal d'audit. Écrans plus tard au S6.
 */
@Controller("admin/shops")
@Authorize("catalog", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class AdminShopController {
  constructor(private readonly shops: ShopService) {}

  /** File des boutiques, de la demande la plus ancienne à la plus récente (filtre par statut possible). */
  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Query({ schema: ShopListParamsSchema }) query: ShopListParams,
  ): Promise<AdminShopPage> {
    const page = await this.shops.list({
      status: query.status,
      limit: query.limit,
      after: query.after ? decodeShopCursor(query.after) : undefined,
    });
    return {
      items: page.items.map(presentAdminShop),
      nextCursor: page.next ? encodeShopCursor(page.next) : null,
    };
  }

  @Get(":shopId")
  @Header("Cache-Control", "no-store")
  async get(@Param({ schema: ShopIdParamsSchema }) params: { shopId: string }): Promise<AdminShop> {
    return presentAdminShop(await withVendorsErrors(() => this.shops.get(params.shopId)));
  }

  /** Valide une boutique en attente, ou réactive une boutique suspendue : le compte reçoit le rôle vendeur. */
  @Post(":shopId/approve")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  approve(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ShopIdParamsSchema }) params: { shopId: string },
    @Req() req: Request,
  ): Promise<AdminShop> {
    return this.decide(session, params.shopId, "approve", null, req);
  }

  /** Refuse une demande, avec un motif montré au demandeur. */
  @Post(":shopId/reject")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  reject(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ShopIdParamsSchema }) params: { shopId: string },
    @Body({ schema: ShopDecisionReasonSchema }) body: ShopDecisionReason,
    @Req() req: Request,
  ): Promise<AdminShop> {
    return this.decide(session, params.shopId, "reject", body.reason, req);
  }

  /** Suspend une boutique active, avec un motif : le compte perd le rôle vendeur. */
  @Post(":shopId/suspend")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  suspend(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ShopIdParamsSchema }) params: { shopId: string },
    @Body({ schema: ShopDecisionReasonSchema }) body: ShopDecisionReason,
    @Req() req: Request,
  ): Promise<AdminShop> {
    return this.decide(session, params.shopId, "suspend", body.reason, req);
  }

  private async decide(
    session: AuthenticatedSession,
    shopId: string,
    decision: ShopDecision,
    reason: string | null,
    req: Request,
  ): Promise<AdminShop> {
    const actor = { accountId: session.account.id, roles: session.account.roles };
    return presentAdminShop(
      await withVendorsErrors(() =>
        this.shops.decide(actor, shopId, decision, reason, auditContextOf(req)),
      ),
    );
  }
}
