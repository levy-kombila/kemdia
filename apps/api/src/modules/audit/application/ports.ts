import type { AuditAction, AuditEntry, AuditEvent } from "../domain/audit-event.js";

/** Ports du module audit (architecture hexagonale). Implémentations dans infrastructure/. */

export const AUDIT_REPOSITORY = Symbol("AUDIT_REPOSITORY");

/** Position dans le journal (pages suivantes) : on lit du plus récent au plus ancien. */
export interface AuditCursor {
  occurredAt: Date;
  id: string;
}

export interface AuditQuery {
  /** 1 à 100 lignes */
  limit: number;
  before?: AuditCursor;
  action?: AuditAction;
  /** Lignes où ce compte AGIT ou EST LA CIBLE */
  accountId?: string;
}

export interface AuditRepository {
  /**
   * Ajoute une ligne. S'exécute dans la transaction en cours s'il y en a une (TransactionContext) :
   * l'action et sa trace sont enregistrées ensemble ou pas du tout.
   */
  append(id: string, entry: AuditEntry): Promise<void>;
  /** Du plus récent au plus ancien, `limit` lignes au plus. */
  list(query: AuditQuery): Promise<AuditEvent[]>;
  /** Supprime au plus `batch` lignes plus vieilles que la durée de conservation (horloge de la base). */
  purgeExpired(batch: number): Promise<number>;
}
