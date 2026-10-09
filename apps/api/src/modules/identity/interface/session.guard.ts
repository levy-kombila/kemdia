import {
  createParamDecorator,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectThrottlerStorage, type ThrottlerStorage } from "@nestjs/throttler";
import type { Request } from "express";
import { SessionService, type AuthenticatedSession } from "../application/session.service.js";
import { IdentityError } from "../domain/identity-error.js";
import { withIdentityErrors } from "./identity-http-errors.js";

type RequestWithSession = Request & { identitySession?: AuthenticatedSession };

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

/** Jeton présenté par le serveur du site : en-tête `Authorization: Bearer <jeton>` (jamais dans l'adresse). */
export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  const match = typeof header === "string" ? BEARER.exec(header) : null;
  return match?.[1] ?? null;
}

/** Limite de requêtes PAR COMPTE sur une route connectée (S4-T07, ADR-0021, MED-05). */
export interface AccountLimit {
  limit: number;
  ttlMs: number;
}

/** Sans réglage particulier : 120 requêtes par minute et par compte, pour chaque route connectée. */
export const DEFAULT_ACCOUNT_LIMIT: AccountLimit = { limit: 120, ttlMs: 60_000 };

const ACCOUNT_LIMIT = Symbol("ACCOUNT_LIMIT");

/** Change la limite par compte d'une route ou d'un contrôleur : `@AccountRateLimit(5)` = 5 par minute. */
export const AccountRateLimit = (limit: number, ttlMs = 60_000) =>
  SetMetadata(ACCOUNT_LIMIT, { limit, ttlMs } satisfies AccountLimit);

/**
 * Protège une route : session valable obligatoire, sinon 401 `SESSION_INVALIDE`.
 * Puis limite PAR COMPTE (S4-T07) : au-delà, 429 `TROP_DE_REQUETES` avec `Retry-After`. Cette limite suit la
 * personne même si elle change d'adresse IP ou passe par le site (clé interne), contrairement à la limite par adresse.
 * Exporté par le module identity : les modules `orders` (S5), `vendors` (S6)… l'utilisent avec `@UseGuards(SessionGuard)`
 * ou `@Authorize(…)`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
    @InjectThrottlerStorage() private readonly counters: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithSession>();
    const token = bearerToken(req) ?? "";
    const session = await withIdentityErrors(() => this.sessions.authenticate(token));
    await this.checkAccountLimit(context, session.account.id);
    req.identitySession = session;
    return true;
  }

  private async checkAccountLimit(context: ExecutionContext, accountId: string): Promise<void> {
    const rule =
      this.reflector.getAllAndOverride<AccountLimit | undefined>(ACCOUNT_LIMIT, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_ACCOUNT_LIMIT;
    // Un compteur par compte ET par route : « tous mes appareils » n'épuise pas la lecture de la session
    const key = `compte:${accountId}:${context.getClass().name}.${context.getHandler().name}`;
    const record = await this.counters.increment(key, rule.ttlMs, rule.limit, rule.ttlMs, "compte");
    if (record.isBlocked) {
      await withIdentityErrors(() =>
        Promise.reject(
          new IdentityError(
            "TROP_DE_REQUETES",
            "trop de demandes pour ce compte : réessayez dans quelques instants",
            Math.max(1, record.timeToBlockExpire),
          ),
        ),
      );
    }
  }
}

/** Dans une route protégée par SessionGuard : la session et le compte de la personne connectée. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedSession => {
    const session = context.switchToHttp().getRequest<RequestWithSession>().identitySession;
    if (!session) throw new Error("CurrentSession utilisé sans SessionGuard");
    return session;
  },
);
