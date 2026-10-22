import { Body, Controller, Header, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  AdminAccountLookupRequestSchema,
  type AdminAccountLookupRequest,
  type SupportAccount,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import type { AuthenticatedSession } from "../application/session.service.js";
import { SupportService } from "../application/support.service.js";
import { withIdentityErrors } from "./identity-http-errors.js";
import { Authorize } from "./role.guard.js";
import { AccountRateLimit, CurrentSession } from "./session.guard.js";

/**
 * Service client (`/api/v1/support/…`, S7.5-T04, ADR-0051) : lecture seule, rôle « support » (ou administrateur) avec
 * double authentification. Chaque consultation d'un compte est inscrite au journal d'audit.
 */
@Controller("support")
@Authorize("support", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /** Retrouver un client par e-mail ou téléphone (dans le corps : jamais dans l'adresse ni les journaux). */
  @Post("accounts/lookup")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async lookup(
    @Body({ schema: AdminAccountLookupRequestSchema }) body: AdminAccountLookupRequest,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<SupportAccount> {
    const found = await withIdentityErrors(() =>
      this.support.lookup(
        { accountId: session.account.id, roles: session.account.roles },
        body.identifier,
        auditContextOf(req),
      ),
    );
    return {
      ...found,
      createdAt: found.createdAt.toISOString(),
      lastActiveAt: found.lastActiveAt.toISOString(),
    };
  }
}
