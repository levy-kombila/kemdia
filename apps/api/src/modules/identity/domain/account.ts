import type { Identifier } from "./identifier.js";
import { IdentityError } from "./identity-error.js";
import { normalizeName } from "./password-policy.js";

/**
 * Compte client (FR-001). Le mot de passe n'est connu que sous forme de hachage Argon2id (ADR-0015).
 *
 * BR-041 : un compte n'existe qu'une fois son identifiant vérifié par un code (ADR-0016).
 * BR-040 (3 échecs → 15 minutes) se compte par IDENTIFIANT, compte ou pas : voir login-guard.ts (ADR-0017).
 */

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
  /** Colonnes du S4-T01 qui ne servent plus (le blocage est dans login_guards, ADR-0017) ; supprimées au S4-T08. */
  failedLogins: number;
  lockedUntil: Date | null;
  createdAt: Date;
}

const invalidName = () =>
  new IdentityError(
    "NOM_INVALIDE",
    "prénom et nom : 2 à 60 lettres (espaces, apostrophes et tirets permis)",
  );

/** Vérifie prénom et nom sans créer de compte (contrôle fait avant toute recherche en base). */
export function assertValidNames(firstName: string, lastName: string): void {
  if (!normalizeName(firstName) || !normalizeName(lastName)) throw invalidName();
}

export interface AccountView {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
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
    if (!firstName || !lastName) throw invalidName();
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

  isActive(): boolean {
    return this.props.status === "active";
  }

  /** Mot de passe changé (mot de passe oublié, S4-T04). */
  changePassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
  }

  /** Ce que le titulaire voit de son compte (jamais le hachage du mot de passe). */
  view(): AccountView {
    return {
      id: this.props.id,
      firstName: this.props.firstName,
      lastName: this.props.lastName,
      email: this.props.email,
      phone: this.props.phone,
    };
  }
}
