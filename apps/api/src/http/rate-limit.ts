import { timingSafeEqual } from "node:crypto";
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

export const INTERNAL_KEY_HEADER = "x-kemdia-internal-key";

/** Une fenêtre d'une minute ; la limite vient de la configuration (RATE_LIMIT_PER_MINUTE). */
export function throttlerOptions(config: AppConfig): ThrottlerModuleOptions {
  return { throttlers: [{ name: "default", ttl: 60_000, limit: config.RATE_LIMIT_PER_MINUTE }] };
}

/** Comparaison en temps constant : la durée ne révèle pas combien de caractères sont justes. */
export function isInternalKey(received: unknown, expected: string | undefined): boolean {
  if (!expected || typeof received !== "string") return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Limitation de débit par adresse IP (mémoire du processus ; Redis au S4 si plusieurs instances).
 * - L'adresse vient de `req.ip`, qui ne lit `X-Forwarded-For` que si TRUST_PROXY le permet (pas d'usurpation).
 * - Le site Kemdia, qui présente la clé interne, n'est pas limité.
 * - Dépassement : 429 au format habituel, avec l'en-tête `Retry-After`.
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

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve((req as unknown as Request).ip ?? "inconnue");
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    return (
      isInternalKey(req.headers[INTERNAL_KEY_HEADER], this.config.API_INTERNAL_KEY) ||
      super.shouldSkip(context)
    );
  }

  protected override throwThrottlingException(): Promise<void> {
    throw new HttpException(
      "Trop de requêtes : réessayez dans quelques instants.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
