import {
  applyDecorators,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthenticatedSession } from "../application/session.service.js";
import { IDENTITY_CLOCK, type Clock } from "../application/ports.js";
import { IdentityError } from "../domain/identity-error.js";
import { hasRole, isRecentLogin, type Role } from "../domain/role.js";
import { withIdentityErrors } from "./identity-http-errors.js";
import { SessionGuard } from "./session.guard.js";

export interface AccessRule {
  /** Il suffit d'UN de ces rôles (un administrateur a aussi les droits d'un modérateur). */
  anyOf: readonly Role[];
  /** Session ouverte il y a moins de 15 minutes (routes d'administration, ADR-0020). */
  recentLogin: boolean;
}

const ACCESS_RULE = Symbol("ACCESS_RULE");

/**
 * Protège une route par rôle (S4-T06, ADR-0020) — à utiliser par TOUS les modules :
 *
 * ```ts
 * @Authorize("vendor")                              // vendeurs (S6)
 * @Authorize("admin", { recentLogin: true })        // administration
 * ```
 *
 * Applique SessionGuard (401 `SESSION_INVALIDE`) puis RoleGuard (403 `ACCES_REFUSE` ou `RECONNEXION_REQUISE`).
 * Les rôles sont relus en base à chaque requête : un rôle retiré ne sert plus, tout de suite.
 */
export function Authorize(role: Role | readonly Role[], options: { recentLogin?: boolean } = {}) {
  const rule: AccessRule = {
    anyOf: typeof role === "string" ? [role] : [...role],
    recentLogin: options.recentLogin ?? false,
  };
  return applyDecorators(SetMetadata(ACCESS_RULE, rule), UseGuards(SessionGuard, RoleGuard));
}

/**
 * Garde de rôle. FERMÉE par défaut : sans règle `@Authorize` (route mal déclarée) ou sans session, elle refuse.
 * Une règle vide (`anyOf: []`) ne laisse passer personne.
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    return withIdentityErrors(() => Promise.resolve(this.check(context)));
  }

  private check(context: ExecutionContext): boolean {
    // Règles de la classe ET de la méthode : TOUTES doivent être respectées. Une règle posée sur une méthode
    // ne peut donc jamais affaiblir celle de son contrôleur (relecture de sécurité S4-T06).
    const rules = [context.getClass(), context.getHandler()]
      .map((target) => this.reflector.get<AccessRule | undefined>(ACCESS_RULE, target))
      .filter((rule): rule is AccessRule => rule !== undefined);
    const session = context
      .switchToHttp()
      .getRequest<Request & { identitySession?: AuthenticatedSession }>().identitySession;
    if (rules.length === 0 || !session) throw denied();

    const roles = session.account.roles;
    for (const rule of rules) {
      if (!rule.anyOf.some((required) => hasRole(roles, required))) throw denied();
    }
    if (
      rules.some((rule) => rule.recentLogin) &&
      !isRecentLogin(session.openedAt, this.clock.now())
    ) {
      throw new IdentityError(
        "RECONNEXION_REQUISE",
        "pour cette action, reconnectez-vous (connexion de moins de 15 minutes exigée)",
      );
    }
    return true;
  }
}

const denied = () => new IdentityError("ACCES_REFUSE", "action réservée à d'autres rôles");
