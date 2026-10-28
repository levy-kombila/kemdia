import { createHash } from "node:crypto";
import { ExecutionContext, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from "@nestjs/throttler";
import type { Request } from "express";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import {
  MAX_COUNTER_KEY_LENGTH,
  RATE_COUNTERS,
  type RateCounters,
} from "../database/rate-counters.js";
import { BusinessException } from "./business-exception.js";
import { clientOf, rateKey, resolveClient } from "./client.js";

/**
 * Visiteurs transmis par le site : limites ×3. Au Gabon, les opérateurs mobiles placent souvent beaucoup
 * d'abonnés derrière une même adresse (CGNAT) ; la connexion reste protégée par le blocage par identifiant (BR-040).
 */
export const SITE_VISITOR_FACTOR = 3;

export { INTERNAL_KEY_HEADER, isInternalKey } from "./internal-key.js";

/** Une fenêtre d'une minute ; la limite vient de la configuration (RATE_LIMIT_PER_MINUTE). */
export function throttlerOptions(config: AppConfig): ThrottlerModuleOptions {
  return { throttlers: [{ name: "default", ttl: 60_000, limit: config.RATE_LIMIT_PER_MINUTE }] };
}

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

const secondsUntil = (date: Date | null, now: Date) =>
  date ? Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 1000)) : 0;

/**
 * Stockage des limites (S8-T07, ADR-0064) : les compteurs partagés (`platform.rate_counters`) au lieu de la mémoire
 * du processus, pour que plusieurs instances de l'API appliquent ENSEMBLE la même limite (adresse et compte). Fenêtre
 * fixe ; au-delà de la limite, la clé est bloquée `blockDuration` (la durée de la fenêtre, par défaut).
 */
export class CountersThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly counters: RateCounters,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = this.clock();
    const raw = `limite:${throttlerName}:${key}`;
    // Clé trop longue pour la colonne (nom de route très long) : remplacée par son empreinte, toujours unique
    const counterKey =
      raw.length <= MAX_COUNTER_KEY_LENGTH
        ? raw
        : `limite:${throttlerName}:${createHash("sha256").update(key).digest("hex")}`;
    const state = await this.counters.hit(counterKey, ttl, now, {
      limit,
      ms: blockDuration > 0 ? blockDuration : 0,
    });
    const timeToExpire = secondsUntil(state.resetAt, now);
    const isBlocked =
      blockDuration > 0
        ? state.blockedUntil !== null && state.blockedUntil > now
        : state.hits > limit;
    return {
      totalHits: state.hits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked
        ? Math.max(1, blockDuration > 0 ? secondsUntil(state.blockedUntil, now) : timeToExpire)
        : 0,
    };
  }
}

/** Module des limites : options de la configuration, compteurs partagés (S8-T07). */
export const throttlerModuleOptions = {
  inject: [APP_CONFIG, RATE_COUNTERS],
  useFactory: (config: AppConfig, counters: RateCounters): ThrottlerModuleOptions => ({
    ...throttlerOptions(config),
    storage: new CountersThrottlerStorage(counters),
  }),
};

/**
 * Limitation de débit par adresse IP (ADR-0021) ; compteurs partagés par toutes les instances depuis S8-T07 (ADR-0064).
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
    return Promise.resolve(rateKey(this.client(req as unknown as Request).ip));
  }

  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const client = this.client(requestProps.context.switchToHttp().getRequest<Request>());
    const limit = client.viaSite ? requestProps.limit * SITE_VISITOR_FACTOR : requestProps.limit;
    return super.handleRequest({ ...requestProps, limit });
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const client = this.client(context.switchToHttp().getRequest<Request>());
    return (client.viaSite && !client.visitorKnown) || super.shouldSkip(context);
  }

  protected override throwThrottlingException(): Promise<void> {
    // Code stable (S4-T07) : le site distingue une limite d'une panne de l'API
    throw new BusinessException(
      HttpStatus.TOO_MANY_REQUESTS,
      "Trop de requêtes : réessayez dans quelques instants.",
      "TROP_DE_REQUETES",
    );
  }
}
