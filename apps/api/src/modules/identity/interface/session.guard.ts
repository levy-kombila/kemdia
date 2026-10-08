import {
  createParamDecorator,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionService, type AuthenticatedSession } from "../application/session.service.js";
import { withIdentityErrors } from "./identity-http-errors.js";

type RequestWithSession = Request & { identitySession?: AuthenticatedSession };

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

/** Jeton présenté par le serveur du site : en-tête `Authorization: Bearer <jeton>` (jamais dans l'adresse). */
export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  const match = typeof header === "string" ? BEARER.exec(header) : null;
  return match?.[1] ?? null;
}

/**
 * Protège une route : session valable obligatoire, sinon 401 `SESSION_INVALIDE`.
 * Exporté par le module identity : les modules `orders` (S5), `vendors` (S6)… l'utilisent avec `@UseGuards(SessionGuard)`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithSession>();
    const token = bearerToken(req) ?? "";
    req.identitySession = await withIdentityErrors(() => this.sessions.authenticate(token));
    return true;
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
