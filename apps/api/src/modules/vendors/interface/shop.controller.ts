import { Body, Controller, Get, Header, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  ShopApplicationRequestSchema,
  type Shop,
  type ShopApplicationRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  CurrentSession,
  SessionGuard,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { ShopService } from "../application/shop.service.js";
import { presentShop } from "./shop.presenter.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

/**
 * La boutique du compte connecté (`/api/v1/vendors/shop`, S6-T01, ADR-0032) : demander à ouvrir sa boutique (ou
 * redemander après un refus) et suivre la décision. Appelé par le SERVEUR du site avec le jeton de session.
 * Jamais mis en cache. Documentation : vendors.openapi.ts.
 */
@Controller("vendors/shop")
@UseGuards(SessionGuard)
export class ShopController {
  constructor(private readonly shops: ShopService) {}

  /** Envoie la demande (201) ; examinée par un administrateur avant toute vente. */
  @Post()
  @Header("Cache-Control", "no-store")
  // Une demande ne s'envoie pas en boucle : 5 par minute et par compte
  @AccountRateLimit(5)
  async apply(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: ShopApplicationRequestSchema }) body: ShopApplicationRequest,
    @Req() req: Request,
  ): Promise<Shop> {
    return presentShop(
      await withVendorsErrors(() =>
        this.shops.apply(session.account.id, body, auditContextOf(req)),
      ),
    );
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async mine(@CurrentSession() session: AuthenticatedSession): Promise<Shop> {
    return presentShop(await withVendorsErrors(() => this.shops.mine(session.account.id)));
  }
}
