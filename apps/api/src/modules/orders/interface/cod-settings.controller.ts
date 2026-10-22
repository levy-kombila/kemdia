import {
  Body,
  Controller,
  Get,
  Header,
  Put,
  Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  CodSettingsRequestSchema,
  type CodSettings,
  type CodSettingsRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { CodSettingsService } from "../application/cod-settings.service.js";
import type { CodSettingsRecord } from "../application/ports.js";

function present(settings: CodSettingsRecord): CodSettings {
  return {
    zones: settings.zones,
    maxTotal: settings.maxTotal,
    updatedAt: settings.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Réglage du paiement à la livraison (`/api/v1/admin/settings/cod`, S5-T04, ADR-0026 ; BR-011). Mêmes protections que
 * les autres routes d'administration (ADR-0020). Le devis et la commande appliquent le nouveau réglage aussitôt.
 */
@Controller("admin/settings/cod")
@Authorize("finance", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class CodSettingsController {
  constructor(private readonly settings: CodSettingsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async get(): Promise<CodSettings> {
    return present(await this.settings.get());
  }

  @Put()
  @Header("Cache-Control", "no-store")
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: CodSettingsRequestSchema }) body: CodSettingsRequest,
    @Req() req: Request,
  ): Promise<CodSettings> {
    try {
      return present(await this.settings.update(session.account.id, body, auditContextOf(req)));
    } catch (error) {
      if (error instanceof RangeError) {
        throw new UnprocessableEntityException(
          error.message.charAt(0).toUpperCase() + error.message.slice(1),
        );
      }
      throw error;
    }
  }
}
