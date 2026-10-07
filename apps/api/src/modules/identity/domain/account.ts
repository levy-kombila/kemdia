import type { Identifier } from "./identifier.js";
import { IdentityError } from "./identity-error.js";
import { normalizeName } from "./password-policy.js";

/**
 * Compte client (FR-001). Le mot de passe n'est connu que sous forme de hachage Argon2id (ADR-0015).
 *
 * BR-040 : après 3 échecs de connexion, le compte est bloqué 15 minutes.
 * BR-041 : connexion impossible tant que l'identifiant n'est pas vérifié par un code.
 */
export const MAX_FAILED_LOGINS = 3;
export const LOCK_DURATION_MS = 15 * 60_000;

export type AccountStatus = "pending" | "active" | "disabled";

export interface AccountProps {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  status: AccountStatus;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  failedLogins: number;
  lockedUntil: Date | null;
  createdAt: Date;
}

export class Account {
  private constructor(private props: AccountProps) {}

  /** Nouveau compte, en attente de vérification de son identifiant. */
  static register(input: {
    id: string;
    firstName: string;
    lastName: string;
    identifier: Identifier;
    passwordHash: string;
    now: Date;
  }): Account {
    const firstName = normalizeName(input.firstName);
    const lastName = normalizeName(input.lastName);
    if (!firstName || !lastName) {
      throw new IdentityError(
        "NOM_INVALIDE",
        "prénom et nom : 2 à 60 lettres (espaces, apostrophes et tirets permis)",
      );
    }
    return new Account({
      id: input.id,
      firstName,
      lastName,
      email: input.identifier.kind === "email" ? input.identifier.value : null,
      phone: input.identifier.kind === "phone" ? input.identifier.value : null,
      passwordHash: input.passwordHash,
      status: "pending",
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: input.now,
    });
  }

  /** Reconstruit un compte lu en base (aucune règle rejouée : la base les garantit déjà). */
  static restore(props: AccountProps): Account {
    return new Account({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get status(): AccountStatus {
    return this.props.status;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }

  snapshot(): Readonly<AccountProps> {
    return { ...this.props };
  }

  /** BR-041 : l'identifiant a reçu et renvoyé le bon code → le compte devient actif. */
  markVerified(identifier: Identifier, now: Date): void {
    if (identifier.kind === "email" && identifier.value === this.props.email) {
      this.props.emailVerifiedAt ??= now;
    } else if (identifier.kind === "phone" && identifier.value === this.props.phone) {
      this.props.phoneVerifiedAt ??= now;
    } else {
      throw new IdentityError("IDENTIFIANT_INVALIDE", "cet identifiant n'appartient pas au compte");
    }
    if (this.props.status === "pending") this.props.status = "active";
  }

  isVerified(): boolean {
    return this.props.emailVerifiedAt !== null || this.props.phoneVerifiedAt !== null;
  }

  isLocked(now: Date): boolean {
    return this.props.lockedUntil !== null && this.props.lockedUntil > now;
  }

  /** BR-040 : un échec de plus ; au 3ᵉ, blocage de 15 minutes et remise à zéro du compteur. */
  recordFailedLogin(now: Date): void {
    if (this.isLocked(now)) return;
    this.props.failedLogins += 1;
    if (this.props.failedLogins >= MAX_FAILED_LOGINS) {
      this.props.lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
      this.props.failedLogins = 0;
    }
  }

  /** Connexion réussie : compteur remis à zéro. */
  recordSuccessfulLogin(): void {
    this.props.failedLogins = 0;
    this.props.lockedUntil = null;
  }

  /** Mot de passe changé (mot de passe oublié, S4-T04) : le blocage éventuel est levé. */
  changePassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.recordSuccessfulLogin();
  }
}
