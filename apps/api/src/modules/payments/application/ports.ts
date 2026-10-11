import type { PaymentAttempt, PaymentChannel, PaymentStatus } from "../domain/payment.js";

/** Nouvel essai de paiement (ou encaissement à la livraison). */
export type NewPayment = Omit<
  PaymentAttempt,
  "id" | "createdAt" | "providerRef" | "failureReason"
> & {
  collectedBy: string | null;
};

export interface PaymentRepository {
  /** Essais de la commande, du premier au dernier. */
  listForOrder(orderId: string): Promise<PaymentAttempt[]>;
  findById(id: string): Promise<PaymentAttempt | null>;
  /** Verrouille l'essai jusqu'à la fin de la transaction. */
  lock(id: string): Promise<PaymentAttempt | null>;
  insert(payment: NewPayment, now: Date): Promise<PaymentAttempt>;
  /** Pose la référence du fournisseur (une seule fois). */
  setProviderRef(id: string, providerRef: string, now: Date): Promise<void>;
  /** Termine l'essai : réussi, échoué ou expiré. */
  complete(
    id: string,
    status: Exclude<PaymentStatus, "pending">,
    now: Date,
    failureReason?: string | null,
  ): Promise<void>;
  /** Demandes envoyées vers ce numéro depuis `since`, tous comptes confondus (refus de l'opérateur non comptés). */
  countForPhoneSince(phone: string, since: Date): Promise<number>;
  /** Essais en attente dont le délai est passé (tâche planifiée). */
  findStale(now: Date, limit: number): Promise<string[]>;
}
export const PAYMENT_REPOSITORY = Symbol("PAYMENT_REPOSITORY");

export type RefundReasonCode = "annulation_admin" | "paiement_non_attendu";

export interface RefundRecord {
  id: string;
  paymentId: string;
  orderId: string;
  orderReference: string;
  amount: number;
  method: Exclude<PaymentChannel, "cod">;
  phone: string;
  reason: RefundReasonCode;
  status: "to_do" | "done";
  externalReference: string | null;
  createdAt: Date;
  doneAt: Date | null;
}

export interface RefundRepository {
  /** Note un remboursement « à faire » pour ce paiement ; `null` s'il existait déjà (un seul par paiement). */
  createFor(
    payment: PaymentAttempt,
    orderReference: string,
    reason: RefundReasonCode,
    now: Date,
    /** Montant reçu, s'il diffère du montant demandé */
    amount?: number,
  ): Promise<RefundRecord | null>;
  /** Remboursement déjà noté fait avec cette référence de l'opérateur. */
  findByExternalReference(externalReference: string): Promise<RefundRecord | null>;
  /** À faire : les plus anciens d'abord ; faits : les plus récents d'abord. */
  list(status: "to_do" | "done", limit: number): Promise<RefundRecord[]>;
  lock(id: string): Promise<RefundRecord | null>;
  markDone(
    id: string,
    externalReference: string,
    adminId: string,
    now: Date,
  ): Promise<RefundRecord>;
}
export const REFUND_REPOSITORY = Symbol("REFUND_REPOSITORY");

/** Demande de paiement envoyée à l'opérateur (Mobile Money). */
export interface PaymentRequest {
  /** Notre identifiant de l'essai : l'opérateur le renvoie avec le résultat */
  paymentId: string;
  orderReference: string;
  amount: number;
  method: Exclude<PaymentChannel, "cod">;
  phone: string;
  /** Compte du client : le téléphone simulé ne montre que les demandes du compte connecté */
  accountId: string;
}

/**
 * Fournisseur Mobile Money (agrégateur ou opérateur : question ouverte n° 7). Le résultat arrive plus tard
 * (`PaymentService.applyProviderResult`, appelé par la notification du fournisseur au S5-T05).
 */
export interface PaymentProvider {
  /** Nom court enregistré avec l'essai (« simule »…). */
  readonly name: string;
  /** Faux : aucun fournisseur branché, les essais sont refusés (`PAIEMENT_INDISPONIBLE`). */
  readonly available: boolean;
  /** Envoie la demande de validation sur le téléphone ; lève `PaymentProviderError` si l'opérateur ne répond pas. */
  request(payment: PaymentRequest): Promise<{ providerRef: string }>;
}
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

// --- Notifications de l'opérateur (S5-T05, ADR-0027) ---

/** Notifications déjà reçues : une notification (son identifiant) n'est traitée qu'une fois. */
export interface ProviderEventRepository {
  /** Enregistre la notification ; `false` si elle avait déjà été reçue (rien n'est écrit). */
  record(event: { id: string; paymentId: string; type: string }, now: Date): Promise<boolean>;
}
export const PROVIDER_EVENT_REPOSITORY = Symbol("PROVIDER_EVENT_REPOSITORY");

/**
 * Clé partagée avec l'opérateur pour signer ses notifications. `null` : aucun opérateur branché, les notifications sont
 * refusées. Simulateur : clé tirée au hasard au démarrage (choix du 2026-10-11).
 */
export interface WebhookKey {
  readonly secret: Uint8Array | null;
}
export const WEBHOOK_KEY = Symbol("WEBHOOK_KEY");

/** L'opérateur n'a pas accepté la demande (indisponible, délai dépassé…). */
export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
