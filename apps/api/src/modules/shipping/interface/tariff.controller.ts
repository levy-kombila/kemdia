import { Body, Controller, Get, Header, Put, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  DeliveryTariffsRequestSchema,
  type DeliveryTariffs,
  type DeliveryTariffsRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { TariffService } from "../application/tariff.service.js";
import { withShippingErrors } from "./shipping-http-errors.js";
import { presentTariffs } from "./shipping.presenter.js";

/**
 * Barème de livraison en vigueur (`/api/v1/shipping/tariffs`, S7-T01) : public, pour que le site affiche les mêmes
 * frais que ceux de la commande.
 */
@Controller("shipping/tariffs")
export class TariffController {
  constructor(private readonly tariffs: TariffService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async get(): Promise<DeliveryTariffs> {
    return presentTariffs(await this.tariffs.get());
  }
}

/**
 * Réglage du barème (`/api/v1/admin/shipping/tariffs`, S7-T01, ADR-0040) : administrateurs, double authentification
 * confirmée ; chaque changement au journal d'audit. Le devis et la commande l'appliquent aussitôt.
 */
@Controller("admin/shipping/tariffs")
@Authorize("logistics", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class AdminTariffController {
  constructor(private readonly tariffs: TariffService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async get(): Promise<DeliveryTariffs> {
    return presentTariffs(await this.tariffs.get());
  }

  @Put()
  @Header("Cache-Control", "no-store")
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: DeliveryTariffsRequestSchema }) body: DeliveryTariffsRequest,
    @Req() req: Request,
  ): Promise<DeliveryTariffs> {
    return presentTariffs(
      await withShippingErrors(() =>
        this.tariffs.update(session.account.id, body.zones, auditContextOf(req)),
      ),
    );
  }
}
