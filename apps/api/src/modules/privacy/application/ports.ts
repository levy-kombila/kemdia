/** Ports du module privacy (S7-T08, ADR-0047). */

/** Copie des données d'un compte, rangée par module (droit d'accès et portabilité). */
export interface CollectedData {
  identite: Record<string, unknown>;
  commandes: Record<string, unknown>;
  paiements: Record<string, unknown>;
  livraisons: Record<string, unknown>;
  boutique: Record<string, unknown>;
  /** Actions du compte et celles qui le visent (journal d'audit, 365 jours) */
  journal: Record<string, unknown>;
  /** Avis donnés sur des produits (S8-T01) */
  avis: Record<string, unknown>[];
}

/** État d'un compte relu et VERROUILLÉ dans la transaction d'effacement (absent ou déjà effacé : `null`). */
export interface LockedAccount {
  lastActiveAt: Date;
  inactivityNoticeAt: Date | null;
}

export interface InactiveAccount {
  id: string;
  /** E-mail, sinon mobile (déjà normalisé) ; `null` si le compte n'a plus de contact */
  contact: string | null;
}

/**
 * Les données personnelles de TOUS les modules (identity, orders, payments, shipping, vendors). Chaque méthode
 * s'exécute dans la transaction en cours, s'il y en a une.
 */
export interface PersonalDataStore {
  lock(accountId: string): Promise<LockedAccount | null>;
  /** Codes bruts renvoyés par les modules (filtrés par le domaine) */
  blockers(accountId: string): Promise<string[]>;
  collect(accountId: string): Promise<CollectedData>;
  erase(accountId: string, now: Date): Promise<void>;
  inactiveToNotify(before: Date, limit: number): Promise<InactiveAccount[]>;
  noticedAndStillInactive(noticedBefore: Date, limit: number): Promise<string[]>;
  /** `true` si l'avis est noté (compte toujours inactif depuis `before`, pas encore prévenu) */
  markNotified(accountId: string, before: Date, now: Date): Promise<boolean>;
}
export const PERSONAL_DATA_STORE = Symbol("PERSONAL_DATA_STORE");

/** Une transaction pour tous les modules : effacés ENSEMBLE ou pas du tout. */
export interface PrivacyTransaction {
  run<T>(work: () => Promise<T>): Promise<T>;
}
export const PRIVACY_TRANSACTION = Symbol("PRIVACY_TRANSACTION");

export interface PrivacyClock {
  now(): Date;
}
export const PRIVACY_CLOCK = Symbol("PRIVACY_CLOCK");
