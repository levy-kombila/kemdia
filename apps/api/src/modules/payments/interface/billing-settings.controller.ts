import { Body, Controller, Get, Header, Put, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  BillingSettingsRequestSchema,
  type BillingSettings,
  type BillingSettingsRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { BillingSettingsService } from "../application/billing-settings.service.js";
import type { BillingSettingsRecord } from "../application/ports.js";

function present(s: BillingSettingsRecord): BillingSettings {
  return {
    legalName: s.legalName,
    address: s.address,
    city: s.city,
    phone: s.phone,
    email: s.email,
    taxId: s.taxId,
    tradeRegister: s.tradeRegister,
    vatMention: s.vatMention,
    updatedAt: s.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Informations de l'entreprise sur les factures (`/api/v1/admin/settings/billing`, S5-T06, ADR-0028). Mêmes
 * protections que les autres routes d'administration (ADR-0020) ; chaque changement au journal d'audit.
 */
@Controller("admin/settings/billing")
@Authorize("admin", { recentLogin: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class BillingSettingsController {
  constructor(private readonly settings: BillingSettingsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async get(): Promise<BillingSettings> {
    return present(await this.settings.get());
  }

  @Put()
  @Header("Cache-Control", "no-store")
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: BillingSettingsRequestSchema }) body: BillingSettingsRequest,
    @Req() req: Request,
  ): Promise<BillingSettings> {
    return present(await this.settings.update(session.account.id, body, auditContextOf(req)));
  }
}
