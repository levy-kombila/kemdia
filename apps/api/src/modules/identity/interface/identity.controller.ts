import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import {
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  ResetPasswordRequestSchema,
  ResetResendRequestSchema,
  SignupRequestSchema,
  SignupResendRequestSchema,
  SignupVerifyRequestSchema,
  type CurrentSession as CurrentSessionView,
  type ForgotPasswordRequest,
  type LoginRequest,
  type ResetPasswordRequest,
  type ResetResendRequest,
  type ResetStarted,
  type LogoutAll,
  type OpenedSession as OpenedSessionView,
  type SignupRequest,
  type SignupResendRequest,
  type SignupStarted,
  type SignupVerified,
  type SignupVerifyRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import { LoginService } from "../application/login.service.js";
import { PasswordResetService } from "../application/password-reset.service.js";
import {
  SessionService,
  type AuthenticatedSession,
  type OpenedSession,
} from "../application/session.service.js";
import { SignupService } from "../application/signup.service.js";
import { withIdentityErrors } from "./identity-http-errors.js";
import { AccountRateLimit, bearerToken, CurrentSession, SessionGuard } from "./session.guard.js";

function presentOpened(opened: OpenedSession): OpenedSessionView {
  return {
    token: opened.token,
    expiresAt: opened.expiresAt.toISOString(),
    account: opened.account,
  };
}

/**
 * Routes de l'identité (`/api/v1/auth/…`). Appelées par le SERVEUR du site (S4-T05), jamais directement
 * par le navigateur : le ticket d'inscription reste côté serveur, dans un cookie HttpOnly.
 * Jamais mises en cache. Documentation : identity.openapi.ts.
 *
 * Limite par adresse IP plus stricte que le reste de l'API (10 par minute) ; les limites par adresse e-mail
 * ou numéro (60 s, 5 par heure) et le blocage après 3 essais de connexion s'appliquent en plus, quel que soit l'appelant.
 *
 * Le serveur du site transmet le navigateur du visiteur dans `X-Kemdia-User-Agent` (liste « mes appareils ») :
 * l'en-tête User-Agent reçu par l'API serait celui du site.
 */
@Controller("auth")
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class IdentityController {
  constructor(
    private readonly signup: SignupService,
    private readonly login: LoginService,
    private readonly sessions: SessionService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  /** FR-001 : crée le compte en attente et envoie le code (réponse identique si le compte existe déjà). */
  @Post("signup")
  @HttpCode(HttpStatus.ACCEPTED)
  @Header("Cache-Control", "no-store")
  start(@Body({ schema: SignupRequestSchema }) body: SignupRequest): Promise<SignupStarted> {
    return withIdentityErrors(() =>
      this.signup.start({
        firstName: body.firstName,
        lastName: body.lastName,
        identifier: body.identifier,
        password: body.password,
      }),
    );
  }

  /** BR-041 : le bon code crée le compte et connecte directement le client. */
  @Post("signup/verify")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async verify(
    @Body({ schema: SignupVerifyRequestSchema }) body: SignupVerifyRequest,
    @Headers("x-kemdia-user-agent") userAgent?: string,
  ): Promise<SignupVerified> {
    const opened = await withIdentityErrors(() =>
      this.signup.verify(body.ticket, body.code, userAgent),
    );
    return { status: "active", ...presentOpened(opened) };
  }

  /** FR-004 : connexion par e-mail ou téléphone ; BR-040 : 3 essais puis 15 minutes, compté par identifiant. */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async signIn(
    @Body({ schema: LoginRequestSchema }) body: LoginRequest,
    @Headers("x-kemdia-user-agent") userAgent?: string,
  ): Promise<OpenedSessionView> {
    const opened = await withIdentityErrors(() =>
      this.login.login({ identifier: body.identifier, password: body.password, userAgent }),
    );
    return presentOpened(opened);
  }

  /** La session présentée (en-tête Authorization) est-elle valable ? La prolonge au passage. */
  @Get("session")
  @Header("Cache-Control", "no-store")
  // Appelée à chaque page par le site : la limite générale de l'API, pas celle des connexions
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @UseGuards(SessionGuard)
  current(@CurrentSession() session: AuthenticatedSession): CurrentSessionView {
    return { expiresAt: session.expiresAt.toISOString(), account: session.account };
  }

  /** Déconnexion : la session est fermée tout de suite. Toujours 204, même pour un jeton déjà fermé. */
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  async logout(@Req() req: Request): Promise<void> {
    const token = bearerToken(req);
    if (token) await this.sessions.logout(token);
  }

  /** « Déconnecter tous mes appareils » (celui-ci compris). */
  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  // 5 par minute et par compte (S4-T07) : le journal d'audit ne se remplit pas de clics répétés
  @AccountRateLimit(5)
  async logoutAll(
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<LogoutAll> {
    return { revoked: await this.sessions.logoutAll(session.account.id, auditContextOf(req)) };
  }

  @Post("signup/resend")
  @HttpCode(HttpStatus.ACCEPTED)
  @Header("Cache-Control", "no-store")
  resend(
    @Body({ schema: SignupResendRequestSchema }) body: SignupResendRequest,
  ): Promise<SignupStarted> {
    return withIdentityErrors(() => this.signup.resend(body.ticket));
  }

  /** FR-012 : code envoyé si un compte existe ; réponse identique sinon (et rien n'est envoyé). */
  @Post("password/forgot")
  @HttpCode(HttpStatus.ACCEPTED)
  @Header("Cache-Control", "no-store")
  forgot(
    @Body({ schema: ForgotPasswordRequestSchema }) body: ForgotPasswordRequest,
  ): Promise<ResetStarted> {
    return withIdentityErrors(() => this.passwordReset.start(body.identifier));
  }

  @Post("password/resend")
  @HttpCode(HttpStatus.ACCEPTED)
  @Header("Cache-Control", "no-store")
  resendReset(
    @Body({ schema: ResetResendRequestSchema }) body: ResetResendRequest,
  ): Promise<ResetStarted> {
    return withIdentityErrors(() => this.passwordReset.resend(body.ticket));
  }

  /** Ticket + code + nouveau mot de passe : connecté ici, déconnecté partout ailleurs, blocage levé. */
  @Post("password/reset")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async resetPassword(
    @Body({ schema: ResetPasswordRequestSchema }) body: ResetPasswordRequest,
    @Req() req: Request,
    @Headers("x-kemdia-user-agent") userAgent?: string,
  ): Promise<OpenedSessionView> {
    const opened = await withIdentityErrors(() =>
      this.passwordReset.reset({
        ticket: body.ticket,
        code: body.code,
        newPassword: body.newPassword,
        userAgent,
        context: auditContextOf(req),
      }),
    );
    return presentOpened(opened);
  }
}
