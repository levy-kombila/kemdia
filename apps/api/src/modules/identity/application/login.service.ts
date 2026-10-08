import { Inject, Injectable } from "@nestjs/common";
import { requireIdentifier } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import { LOGIN_LOCK_MS, MAX_LOGIN_ATTEMPTS, isLocked } from "../domain/login-guard.js";
import { PASSWORD_MAX_LENGTH } from "../domain/password-policy.js";
import { SessionService, type OpenedSession } from "./session.service.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  LOGIN_GUARD_REPOSITORY,
  PASSWORD_HASHER,
  type AccountRepository,
  type Clock,
  type LoginGuardRepository,
  type PasswordHasher,
} from "./ports.js";

export interface LoginInput {
  identifier: string;
  password: string;
  userAgent?: string;
}

const wrongCredentials = () =>
  new IdentityError("IDENTIFIANTS_INCORRECTS", "identifiant ou mot de passe incorrect");

function tooManyAttempts(lockedUntil: Date, now: Date): IdentityError {
  const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
  return new IdentityError(
    "COMPTE_BLOQUE",
    `trop d'essais : réessayez dans ${Math.ceil(seconds / 60)} min`,
    seconds,
  );
}

/**
 * Connexion (FR-004, BR-040, BR-041) — ADR-0017.
 *
 * Rien ne distingue une adresse sans compte d'un mauvais mot de passe :
 * - même message (« identifiant ou mot de passe incorrect ») ;
 * - même blocage après 3 essais (compté par identifiant, compte ou pas) ;
 * - même durée : sans compte, le mot de passe est comparé à un hachage factice.
 * Seul un compte désactivé, avec le BON mot de passe, reçoit un message à part.
 */
@Injectable()
export class LoginService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(LOGIN_GUARD_REPOSITORY) private readonly guards: LoginGuardRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionService,
  ) {}

  async login(input: LoginInput): Promise<OpenedSession> {
    const identifier = requireIdentifier(input.identifier);
    // Un mot de passe trop long ne peut pas être le bon : inutile de le hacher (protège le serveur)
    if (input.password.length === 0 || input.password.length > PASSWORD_MAX_LENGTH) {
      throw wrongCredentials();
    }

    const now = this.clock.now();
    const guard = await this.guards.claim(identifier.value, now);
    if (isLocked(guard, now) && guard.lockedUntil) throw tooManyAttempts(guard.lockedUntil, now);

    const account = await this.accounts.findByIdentifier(identifier);
    const hash = account?.passwordHash ?? this.hasher.dummyHash;
    const passwordOk = await this.hasher.verify(hash, input.password);

    if (!account || !passwordOk) {
      if (guard.attempts >= MAX_LOGIN_ATTEMPTS) {
        const until = new Date(now.getTime() + LOGIN_LOCK_MS);
        await this.guards.lock(identifier.value, until);
        throw tooManyAttempts(until, now);
      }
      throw wrongCredentials();
    }

    await this.guards.reset(identifier.value, now);
    if (!account.isActive()) {
      throw new IdentityError(
        "COMPTE_DESACTIVE",
        "ce compte est désactivé : contactez le service client Kemdia",
      );
    }
    return this.sessions.open(account, input.userAgent);
  }
}
