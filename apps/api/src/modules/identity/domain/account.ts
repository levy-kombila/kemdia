import type { Identifier } from "./identifier.js";
import { IdentityError } from "./identity-error.js";
import { normalizeName } from "./password-policy.js";
import { effectiveRoles, STORED_ROLES, type Role, type StoredRole } from "./role.js";

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
  /** +1 à chaque changement de mot de passe ; une session ouverte avec une autre version est refusée (ADR-0018). */
  passwordVersion: number;
  status: AccountStatus;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  /** Rôles enregistrés (S4-T06) ; jamais écrits par `AccountRepository.save` (voir RoleRepository) */
  roles: readonly StoredRole[];
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
  /** Toujours `client`, puis les rôles enregistrés (S4-T06) */
  roles: Role[];
}

/** Ce que l'administration voit d'un compte (S4-T06) : jamais le hachage ni les compteurs. */
export interface AdminAccountView extends AccountView {
  status: AccountStatus;
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
    if (!firstName || !lastName) throw invalidName();
    return new Account({
      id: input.id,
      firstName,
      lastName,
      email: input.identifier.kind === "email" ? input.identifier.value : null,
      phone: input.identifier.kind === "phone" ? input.identifier.value : null,
      passwordHash: input.passwordHash,
      passwordVersion: 0,
      status: "pending",
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      roles: [],
      createdAt: input.now,
    });
  }

  /** Reconstruit un compte lu en base (aucune règle rejouée : la base les garantit déjà). */
  static restore(props: AccountProps): Account {
    return new Account({ ...props, roles: STORED_ROLES.filter((r) => props.roles.includes(r)) });
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

  get passwordVersion(): number {
    return this.props.passwordVersion;
  }

  get roles(): Role[] {
    return effectiveRoles(this.props.roles);
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

  /** Mot de passe changé (mot de passe oublié, S4-T04) : les sessions ouvertes avec l'ancien ne valent plus rien. */
  changePassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.props.passwordVersion += 1;
  }

  /** L'identifiant (e-mail ou téléphone) appartient-il encore à ce compte ? */
  owns(identifier: Identifier): boolean {
    return identifier.kind === "email"
      ? identifier.value === this.props.email
      : identifier.value === this.props.phone;
  }

  /** Ce que le titulaire voit de son compte (jamais le hachage du mot de passe). */
  view(): AccountView {
    return {
      id: this.props.id,
      firstName: this.props.firstName,
      lastName: this.props.lastName,
      email: this.props.email,
      phone: this.props.phone,
      roles: this.roles,
    };
  }

  adminView(): AdminAccountView {
    return { ...this.view(), status: this.props.status, createdAt: this.props.createdAt };
  }
}
