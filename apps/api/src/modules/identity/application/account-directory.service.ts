import { Inject, Injectable } from "@nestjs/common";
import { ACCOUNT_REPOSITORY, type AccountRepository } from "./ports.js";

/** Comment joindre un compte par e-mail (factures, S5-T06). */
export interface AccountContact {
  firstName: string;
  lastName: string;
  /** Adresse e-mail VÉRIFIÉE (code reçu), sinon `null` : on n'écrit jamais à une adresse non prouvée */
  email: string | null;
}

/**
 * Annuaire des comptes pour les autres modules (port public, S5-T06) : seulement ce qu'il faut pour écrire au client,
 * jamais le hachage du mot de passe ni les compteurs. Compte inconnu ou supprimé : `null`.
 */
@Injectable()
export class AccountDirectory {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository) {}

  async contactOf(accountId: string): Promise<AccountContact | null> {
    const account = await this.accounts.findById(accountId);
    if (!account) return null;
    const { firstName, lastName, email, emailVerifiedAt } = account.snapshot();
    return { firstName, lastName, email: email && emailVerifiedAt ? email : null };
  }
}
