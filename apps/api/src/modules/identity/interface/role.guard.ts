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
import {
  IDENTITY_CLOCK,
  SECOND_FACTOR_REPOSITORY,
  type Clock,
  type SecondFactorRepository,
} from "../application/ports.js";
import { IdentityError } from "../domain/identity-error.js";
import { hasRole, type Role } from "../domain/role.js";
import { isSecondFactorRecent } from "../domain/second-factor.js";
import { withIdentityErrors } from "./identity-http-errors.js";
import { SessionGuard } from "./session.guard.js";

export interface AccessRule {
  /** Il suffit d'UN de ces rôles (un administrateur a aussi les droits d'un modérateur). */
  anyOf: readonly Role[];
  /**
   * Route d'équipe (S6-T03, ADR-0034, MED-15) : session confirmée par la double authentification il y a moins de
   * 15 minutes. Remplace la « connexion récente » de l'ADR-0020 : une session volée ne suffit plus sans le téléphone.
   */
  secondFactor: boolean;
}

const ACCESS_RULE = Symbol("ACCESS_RULE");

/**
 * Protège une route par rôle (S4-T06, ADR-0020) — à utiliser par TOUS les modules :
 *
 * ```ts
 * @Authorize("vendor")                              // vendeurs (S6)
 * @Authorize("admin", { secondFactor: true })       // administration (double authentification)
 * ```
 *
 * Applique SessionGuard (401 `SESSION_INVALIDE`) puis RoleGuard (403 `ACCES_REFUSE`, `DEUX_FACTEURS_A_ACTIVER` ou
 * `DEUX_FACTEURS_REQUIS`).
 * Les rôles sont relus en base à chaque requête : un rôle retiré ne sert plus, tout de suite.
 */
export function Authorize(role: Role | readonly Role[], options: { secondFactor?: boolean } = {}) {
  const rule: AccessRule = {
    anyOf: typeof role === "string" ? [role] : [...role],
    secondFactor: options.secondFactor ?? false,
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
    @Inject(SECOND_FACTOR_REPOSITORY)
    private readonly factors: Pick<SecondFactorRepository, "find">,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    return withIdentityErrors(() => this.check(context));
  }

  private async check(context: ExecutionContext): Promise<boolean> {
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
      rules.some((rule) => rule.secondFactor) &&
      !isSecondFactorRecent(session.secondFactorAt, this.clock.now())
    ) {
      // Confirmée il y a plus de 15 minutes, ou jamais : activée ou pas encore ? (réponse utile au site)
      const record = await this.factors.find(session.account.id);
      if (!record?.enabledAt) {
        throw new IdentityError(
          "DEUX_FACTEURS_A_ACTIVER",
          "activez la double authentification de votre compte pour accéder à cette page",
        );
      }
      throw new IdentityError(
        "DEUX_FACTEURS_REQUIS",
        "confirmez votre identité avec le code de votre application d'authentification",
      );
    }
    return true;
  }
}

const denied = () => new IdentityError("ACCES_REFUSE", "action réservée à d'autres rôles");
