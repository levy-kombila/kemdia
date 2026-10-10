import { PaymentsError } from "./payments-error.js";

/**
 * Paiement d'une commande (S5-T04, ADR-0026) — TypeScript pur.
 *
 * Mobile Money : le client demande la validation sur son téléphone ; l'essai attend la réponse de l'opérateur au plus
 * 3 minutes (sans dépasser l'échéance de la commande), puis expire. 3 essais au plus par commande, avec le même
 * opérateur. Un essai expiré ou échoué peut encore réussir si l'argent arrive en retard : il confirme alors la
 * commande si elle attend encore, sinon il est à rembourser.
 * À la livraison : un encaissement en espèces, noté par un administrateur (en attendant le livreur, S7).
 */
export const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "expired"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentChannel = "airtel" | "moov" | "cod";

/** Essais Mobile Money au plus par commande (choix du 2026-10-10). */
export const MAX_PAYMENT_ATTEMPTS = 3;
/** Durée d'un essai sans réponse de l'opérateur. */
export const ATTEMPT_MS = 3 * 60_000;
/**
 * Demande que l'opérateur n'a pas acceptée (injoignable) : elle ne compte pas dans les 3 essais du client (relecture de
 * sécurité du S5-T04), mais une commande n'a jamais plus de `MAX_PAYMENT_ROWS` lignes.
 */
export const PROVIDER_DOWN = "operateur_indisponible";
export const MAX_PAYMENT_ROWS = 10;
/** Demandes vers un même numéro, tous comptes confondus, par heure (on ne harcèle pas le téléphone d'un autre). */
export const MAX_REQUESTS_PER_PHONE_PER_HOUR = 5;

export interface PaymentAttempt {
  id: string;
  orderId: string;
  accountId: string;
  method: PaymentChannel;
  amount: number;
  phone: string | null;
  status: PaymentStatus;
  attempt: number;
  provider: string;
  providerRef: string | null;
  failureReason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}

/** Statut vu par le client : un essai en attente dont le délai est passé est expiré (même avant la tâche planifiée). */
export function effectiveStatus(payment: PaymentAttempt, now: Date): PaymentStatus {
  if (payment.status === "pending" && payment.expiresAt && payment.expiresAt <= now)
    return "expired";
  return payment.status;
}

/** Fin d'un nouvel essai : 3 minutes, sans dépasser l'échéance de paiement de la commande. */
export function attemptExpiry(now: Date, paymentDueAt: Date): Date {
  return new Date(Math.min(now.getTime() + ATTEMPT_MS, paymentDueAt.getTime()));
}

/** Ce que le domaine regarde d'une commande pour accepter un essai. */
export interface PayableOrder {
  status: string;
  paymentMethod: PaymentChannel;
  paymentDueAt: Date | null;
}

/**
 * Numéro du prochain essai, ou l'erreur qui l'empêche. `attempts` : essais déjà faits pour la commande (ceux en
 * attente dont le délai est passé comptent comme expirés).
 */
export function nextAttempt(
  order: PayableOrder,
  attempts: readonly PaymentAttempt[],
  now: Date,
): number {
  if (
    order.paymentMethod === "cod" ||
    order.status !== "pending_payment" ||
    !order.paymentDueAt ||
    order.paymentDueAt <= now
  ) {
    throw new PaymentsError(
      "PAIEMENT_IMPOSSIBLE",
      order.status === "pending_payment" || order.paymentMethod === "cod"
        ? "cette commande ne se paie pas par Mobile Money maintenant"
        : "cette commande n'attend plus de paiement",
    );
  }
  if (attempts.some((a) => effectiveStatus(a, now) === "pending")) {
    throw new PaymentsError(
      "PAIEMENT_EN_COURS",
      "une demande de paiement attend déjà votre validation sur le téléphone",
    );
  }
  if (countedAttempts(attempts) >= MAX_PAYMENT_ATTEMPTS || attempts.length >= MAX_PAYMENT_ROWS) {
    throw new PaymentsError(
      "TROP_D_ESSAIS_PAIEMENT",
      `${MAX_PAYMENT_ATTEMPTS} essais déjà faits : la commande sera annulée si elle n'est pas payée à temps`,
    );
  }
  return attempts.length + 1;
}

/** Essais qui comptent : ceux que l'opérateur a acceptés (envoyés sur le téléphone). */
export function countedAttempts(attempts: readonly PaymentAttempt[]): number {
  return attempts.filter((a) => a.failureReason !== PROVIDER_DOWN).length;
}

/** Essais encore possibles pour la commande. */
export function attemptsLeft(attempts: readonly PaymentAttempt[]): number {
  return Math.max(
    0,
    Math.min(MAX_PAYMENT_ATTEMPTS - countedAttempts(attempts), MAX_PAYMENT_ROWS - attempts.length),
  );
}

/** Raison d'échec venue du fournisseur : courte, lettres minuscules et soulignés seulement (affichée et enregistrée). */
export function normalizeFailureReason(raw: string | undefined): string {
  const clean = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z_]/g, "")
    .slice(0, 60);
  return clean || "refuse";
}
