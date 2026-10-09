import { ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from "@nestjs/throttler";
import type { Request } from "express";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { clientOf, resolveClient } from "./client.js";

export { INTERNAL_KEY_HEADER, isInternalKey } from "./internal-key.js";

/** Une fenêtre d'une minute ; la limite vient de la configuration (RATE_LIMIT_PER_MINUTE). */
export function throttlerOptions(config: AppConfig): ThrottlerModuleOptions {
  return { throttlers: [{ name: "default", ttl: 60_000, limit: config.RATE_LIMIT_PER_MINUTE }] };
}

/**
 * Limitation de débit par adresse IP (mémoire du processus, ADR-0021 ; Redis quand il y aura plusieurs instances).
 * - Appel direct : l'adresse vient de `req.ip`, qui ne lit `X-Forwarded-For` que si TRUST_PROXY le permet.
 * - Appel du site pour un visiteur (clé interne + `X-Kemdia-Client-IP`, S4-T07) : limité par visiteur.
 * - Appel du site sans visiteur (lecture du catalogue) : pas limité (le site sert tout le monde depuis une adresse).
 * - Dépassement : 429 au format habituel, avec l'en-tête `Retry-After`.
 * Les limites PAR COMPTE (routes connectées) sont posées par SessionGuard (module identity).
 */
@Injectable()
export class KemdiaThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super(options, storage, reflector);
  }

  private client(req: Request) {
    return clientOf(req) ?? resolveClient(req, this.config);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(this.client(req as unknown as Request).ip);
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const client = this.client(context.switchToHttp().getRequest<Request>());
    return (client.viaSite && !client.visitorKnown) || super.shouldSkip(context);
  }

  protected override throwThrottlingException(): Promise<void> {
    throw new HttpException(
      "Trop de requêtes : réessayez dans quelques instants.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
