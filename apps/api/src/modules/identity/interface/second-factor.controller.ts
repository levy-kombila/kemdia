import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  SecondFactorCodeRequestSchema,
  SecondFactorSetupRequestSchema,
  type RecoveryCodes,
  type SecondFactorCodeRequest,
  type SecondFactorSetupRequest,
  type SecondFactorEnabled,
  type SecondFactorSetup,
  type SecondFactorStatus,
  type SecondFactorVerified,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import { SecondFactorService } from "../application/second-factor.service.js";
import type { AuthenticatedSession } from "../application/session.service.js";
import { withIdentityErrors } from "./identity-http-errors.js";
import { AccountRateLimit, CurrentSession, SessionGuard } from "./session.guard.js";

/**
 * Double authentification de l'équipe (`/api/v1/auth/2fa/…`, S6-T03, ADR-0034, MED-15). Compte connecté ; appelé par
 * le SERVEUR du site. Jamais mis en cache (secrets et codes de secours). Les codes faux sont comptés : 3 échecs →
 * 15 minutes de blocage. Documentation : identity.openapi.ts.
 */
@Controller("auth/2fa")
@UseGuards(SessionGuard)
export class SecondFactorController {
  constructor(private readonly factors: SecondFactorService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async status(@CurrentSession() session: AuthenticatedSession): Promise<SecondFactorStatus> {
    const status = await withIdentityErrors(() => this.factors.status(session));
    return { ...status, verifiedUntil: status.verifiedUntil?.toISOString() ?? null };
  }

  /** Nouveau secret (QR code), contre le mot de passe du compte. */
  @Post("setup")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(5)
  setup(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: SecondFactorSetupRequestSchema }) body: SecondFactorSetupRequest,
    @Req() req: Request,
  ): Promise<SecondFactorSetup> {
    return withIdentityErrors(() =>
      this.factors.setup(session, body.password, auditContextOf(req)),
    );
  }

  /** Premier code : active la 2FA et renvoie les 10 codes de secours, une seule fois. */
  @Post("enable")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(10)
  async enable(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: SecondFactorCodeRequestSchema }) body: SecondFactorCodeRequest,
    @Req() req: Request,
  ): Promise<SecondFactorEnabled> {
    const enabled = await withIdentityErrors(() =>
      this.factors.enable(session, body.code, auditContextOf(req)),
    );
    return {
      recoveryCodes: enabled.recoveryCodes,
      verifiedUntil: enabled.verifiedUntil.toISOString(),
    };
  }

  /** Confirme la session pour 15 minutes (code de l'application ou code de secours). */
  @Post("verify")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(10)
  async verify(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: SecondFactorCodeRequestSchema }) body: SecondFactorCodeRequest,
    @Req() req: Request,
  ): Promise<SecondFactorVerified> {
    const verified = await withIdentityErrors(() =>
      this.factors.verify(session, body.code, auditContextOf(req)),
    );
    return {
      verifiedUntil: verified.verifiedUntil.toISOString(),
      recoveryCodesLeft: verified.recoveryCodesLeft,
    };
  }

  /** Nouveaux codes de secours (les anciens ne servent plus), contre un code frais de l'application. */
  @Post("recovery-codes")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(5)
  async regenerate(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: SecondFactorCodeRequestSchema }) body: SecondFactorCodeRequest,
    @Req() req: Request,
  ): Promise<RecoveryCodes> {
    return {
      recoveryCodes: await withIdentityErrors(() =>
        this.factors.regenerateRecoveryCodes(session, body.code, auditContextOf(req)),
      ),
    };
  }
}
