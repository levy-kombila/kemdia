import { Body, Controller, Header, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  SignupRequestSchema,
  SignupResendRequestSchema,
  SignupVerifyRequestSchema,
  type SignupRequest,
  type SignupResendRequest,
  type SignupStarted,
  type SignupVerified,
  type SignupVerifyRequest,
} from "@kemdia/contracts";
import { SignupService } from "../application/signup.service.js";
import { withIdentityErrors } from "./identity-http-errors.js";

/**
 * Routes de l'identité (`/api/v1/auth/…`). Appelées par le SERVEUR du site (S4-T05), jamais directement
 * par le navigateur : le ticket d'inscription reste côté serveur, dans un cookie HttpOnly.
 * Jamais mises en cache. Documentation : identity.openapi.ts.
 *
 * Limite par adresse IP plus stricte que le reste de l'API (10 par minute) ; les limites par adresse e-mail
 * ou numéro (60 s, 5 par heure) s'appliquent en plus, quel que soit l'appelant.
 */
@Controller("auth")
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class IdentityController {
  constructor(private readonly signup: SignupService) {}

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

  /** BR-041 : le bon code rend le compte actif. */
  @Post("signup/verify")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async verify(
    @Body({ schema: SignupVerifyRequestSchema }) body: SignupVerifyRequest,
  ): Promise<SignupVerified> {
    await withIdentityErrors(() => this.signup.verify(body.ticket, body.code));
    return { status: "active" };
  }

  @Post("signup/resend")
  @HttpCode(HttpStatus.ACCEPTED)
  @Header("Cache-Control", "no-store")
  resend(
    @Body({ schema: SignupResendRequestSchema }) body: SignupResendRequest,
  ): Promise<SignupStarted> {
    return withIdentityErrors(() => this.signup.resend(body.ticket));
  }
}
