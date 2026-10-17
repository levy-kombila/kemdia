import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import {
  OrderCancelHooks,
  OrderPayments,
  OrdersError,
  validatePayment,
  type OrderRecord,
} from "../../orders/index.js";
import {
  attemptExpiry,
  attemptsLeft,
  MAX_REQUESTS_PER_PHONE_PER_HOUR,
  PROVIDER_DOWN,
  effectiveStatus,
  nextAttempt,
  normalizeFailureReason,
  type PaymentAttempt,
} from "../domain/payment.js";
import { PaymentsError } from "../domain/payments-error.js";
import { InvoiceService } from "./invoice.service.js";
import {
  PAYMENT_PROVIDER,
  PAYMENT_REPOSITORY,
  PaymentProviderError,
  REFUND_REPOSITORY,
  type PaymentProvider,
  type PaymentRepository,
  type RefundRepository,
} from "./ports.js";

export interface PaymentView {
  payment: PaymentAttempt;
  orderReference: string;
  attemptsLeft: number;
}

/** Résultat transmis par le fournisseur (notification signée au S5-T05). */
export interface ProviderResult {
  /** Notre identifiant de l'essai, renvoyé par le fournisseur */
  paymentId: string;
  /** Référence de l'opération chez le fournisseur : obligatoire si l'essai en a déjà une */
  providerRef?: string | undefined;
  outcome: "succeeded" | "failed";
  /** Montant réellement reçu, en FCFA (obligatoire pour une réussite) : comparé au montant demandé */
  amount?: number | undefined;
  failureReason?: string | undefined;
}

/** Attente maximale de la réponse de l'opérateur à une demande (au-delà : comme injoignable). */
export const PROVIDER_TIMEOUT_MS = 15_000;
const PROVIDER_REF = /^[A-Za-z0-9._:-]{1,100}$/;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PaymentProviderError("délai dépassé")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Paiement Mobile Money d'une commande par son client (S5-T04, ADR-0026).
 *
 * Un essai : (1) en transaction, commande verrouillée, règles vérifiées (en attente de paiement, dans les délais, pas
 * d'essai en cours, 3 au plus), essai enregistré « en attente » ; (2) HORS transaction, demande envoyée à l'opérateur
 * (aucun verrou gardé pendant l'appel réseau) ; (3) référence de l'opérateur notée. Le résultat arrive plus tard
 * (`applyProviderResult`).
 */
@Injectable()
export class PaymentService implements OnModuleInit {
  private readonly logger = new Logger("Paiements");
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    private readonly orders: OrderPayments,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: RefundRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly invoices: InvoiceService,
    private readonly cancelHooks: OrderCancelHooks,
  ) {}

  /**
   * Annulation par le client (S5-T07, relecture de sécurité) : ses demandes encore en attente sont expirées dans la
   * même transaction, comme pour l'annulation par un administrateur. Le téléphone simulé ne les montre plus, et un
   * résultat de l'opérateur arrivé quand même déclenche un remboursement « à faire » (ADR-0026).
   */
  onModuleInit(): void {
    this.cancelHooks.onClientCancel(async (order, now) => {
      const attempts = await this.payments.listForOrder(order.id);
      for (const attempt of attempts.filter((a) => a.status === "pending")) {
        await this.payments.complete(attempt.id, "expired", now, "commande_annulee");
        // Simulateur : retirée du téléphone (en mémoire ; si la transaction échoue, l'essai expire en 3 minutes)
        this.provider.cancel?.(attempt.id);
      }
    });
    // Commande refusée par un vendeur, ou sans réponse d'un vendeur à temps (S6-T07, ADR-0038) : comme l'annulation par
    // un administrateur — essais en attente expirés, remboursement « à faire » de chaque paiement Mobile Money reçu,
    // avoir si la commande était facturée. Déjà encaissée en espèces : refus (l'argent est chez le livreur ou le client).
    this.cancelHooks.onVendorCancel(async (order, now) => {
      const attempts = await this.payments.listForOrder(order.id);
      if (attempts.some((a) => a.method === "cod" && a.status === "succeeded")) {
        throw new OrdersError(
          "ANNULATION_IMPOSSIBLE",
          "cette commande est déjà encaissée en espèces : contactez le service client Kemdia",
        );
      }
      for (const attempt of attempts.filter((a) => a.status === "pending")) {
        await this.payments.complete(attempt.id, "expired", now, "commande_annulee");
        this.provider.cancel?.(attempt.id);
      }
      for (const paid of attempts.filter((a) => a.status === "succeeded" && a.method !== "cod")) {
        await this.refunds.createFor(paid, order.reference, "annulation_vendeur", now);
      }
      await this.invoices.issueCreditNote(order, now);
    });
  }

  /** Demande (ou redemande) la validation du paiement sur le téléphone. */
  async start(accountId: string, reference: string, phoneInput?: string): Promise<PaymentView> {
    if (!this.provider.available) throw unavailable();
    const { payment, order } = await this.orders.transaction(async () => {
      const order = await this.orders.lockForAccount(accountId, reference);
      const now = this.clock();
      const attempts = await this.payments.listForOrder(order.id);
      const attempt = nextAttempt(order, attempts, now);
      // Essais en attente dont le délai est passé : notés expirés (le dernier ne bloque plus)
      for (const stale of attempts.filter((a) => a.status === "pending")) {
        await this.payments.complete(stale.id, "expired", now, "sans_reponse");
      }
      // Autre numéro possible, mais du MÊME opérateur que la commande
      const phone =
        phoneInput === undefined
          ? order.paymentPhone!
          : validatePayment(order.paymentMethod, phoneInput).phone!;
      // Pas plus de 5 demandes par heure vers un même numéro, tous comptes confondus (relecture de sécurité du S5-T04)
      const since = new Date(now.getTime() - 60 * 60_000);
      if (
        (await this.payments.countForPhoneSince(phone, since)) >= MAX_REQUESTS_PER_PHONE_PER_HOUR
      ) {
        throw new PaymentsError(
          "TROP_D_ESSAIS_PAIEMENT",
          "trop de demandes de paiement vers ce numéro : réessayez dans une heure",
        );
      }
      const payment = await this.payments.insert(
        {
          orderId: order.id,
          accountId,
          method: order.paymentMethod,
          amount: order.total,
          phone,
          status: "pending",
          attempt,
          provider: this.provider.name,
          collectedBy: null,
          expiresAt: attemptExpiry(now, order.paymentDueAt!),
          completedAt: null,
        },
        now,
      );
      return { payment, order };
    });

    let providerRef: string;
    try {
      ({ providerRef } = await withTimeout(
        this.provider.request({
          paymentId: payment.id,
          orderReference: order.reference,
          amount: payment.amount,
          method: payment.method as "airtel" | "moov",
          phone: payment.phone!,
          accountId,
        }),
        PROVIDER_TIMEOUT_MS,
      ));
      if (!PROVIDER_REF.test(providerRef)) throw new PaymentProviderError("référence invalide");
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) {
        this.logger.warn(
          `fournisseur : ${error instanceof Error ? error.name : "erreur inconnue"}`,
        );
      }
      // Noté échoué « opérateur injoignable » : ne compte pas dans les 3 essais, le client peut réessayer
      await this.orders.transaction(async () => {
        const current = await this.payments.lock(payment.id);
        if (current?.status === "pending") {
          await this.payments.complete(payment.id, "failed", this.clock(), PROVIDER_DOWN);
        }
      });
      throw unavailable();
    }
    await this.orders.transaction(async () => {
      const current = await this.payments.lock(payment.id);
      if (current && current.providerRef === null) {
        await this.payments.setProviderRef(payment.id, providerRef, this.clock());
      }
    });
    return this.view(order, payment.id);
  }

  /** Dernier essai de la commande du compte (le site interroge pendant que le client valide). */
  async latest(accountId: string, reference: string): Promise<PaymentView> {
    const order = await this.orders.findForAccount(accountId, reference);
    return this.view(order);
  }

  private async view(order: OrderRecord, paymentId?: string): Promise<PaymentView> {
    const attempts = await this.payments.listForOrder(order.id);
    const payment = paymentId ? attempts.find((a) => a.id === paymentId) : attempts.at(-1);
    if (!payment)
      throw new PaymentsError("PAIEMENT_INTROUVABLE", "aucun paiement pour cette commande");
    const now = this.clock();
    return {
      payment: { ...payment, status: effectiveStatus(payment, now) },
      orderReference: order.reference,
      attemptsLeft: order.status === "pending_payment" ? attemptsLeft(attempts) : 0,
    };
  }

  /**
   * Résultat d'un essai, transmis par le fournisseur. Idempotent (le même résultat reçu deux fois ne change rien).
   * Réussi : la commande en attente passe « confirmée » ; si elle n'attendait plus ce paiement (annulée, déjà payée),
   * un remboursement est noté « à faire ». Verrous : commande puis essai (même ordre partout).
   */
  async applyProviderResult(result: ProviderResult): Promise<PaymentAttempt> {
    const found = await this.payments.findById(result.paymentId);
    if (!found || found.method === "cod") throw paymentNotFound();
    return this.orders.transaction(async () => {
      const order = await this.orders.lockById(found.orderId);
      const payment = await this.payments.lock(found.id);
      if (!payment) throw paymentNotFound();
      // Référence mal formée, ou absente / différente de celle déjà notée : ce n'est pas cet essai
      if (result.providerRef !== undefined && !PROVIDER_REF.test(result.providerRef)) {
        throw paymentNotFound();
      }
      if (payment.providerRef && payment.providerRef !== result.providerRef)
        throw paymentNotFound();
      const now = this.clock();
      if (result.providerRef && payment.providerRef === null) {
        await this.payments.setProviderRef(payment.id, result.providerRef, now);
      }
      if (result.outcome === "failed") {
        if (payment.status === "pending") {
          await this.payments.complete(
            payment.id,
            "failed",
            now,
            normalizeFailureReason(result.failureReason),
          );
        }
        return (await this.payments.findById(payment.id))!;
      }
      if (payment.status === "succeeded") return payment;
      const received = result.amount;
      if (received === undefined || !Number.isSafeInteger(received) || received <= 0) {
        throw new PaymentsError("PAIEMENT_INTROUVABLE", "montant reçu absent ou invalide");
      }
      await this.payments.complete(payment.id, "succeeded", now, null);
      const paid = (await this.payments.findById(payment.id))!;
      // Montant différent de celui demandé : la commande n'est pas confirmée, la somme reçue est à rendre
      const confirmed =
        order && received === payment.amount
          ? await this.orders.confirmPaid(order, received, now)
          : false;
      if (confirmed && order) {
        // Facture établie au paiement reçu, dans la même transaction (S5-T06, FR-015)
        await this.invoices.issueForPayment(order, paid, now);
        // Les autres essais encore en attente n'ont plus lieu d'être (pas de deuxième paiement)
        for (const other of await this.payments.listForOrder(payment.orderId)) {
          if (other.id !== payment.id && other.status === "pending") {
            await this.payments.complete(other.id, "expired", now, "commande_payee");
          }
        }
      } else if (order) {
        await this.refunds.createFor(paid, order.reference, "paiement_non_attendu", now, received);
        this.logger.warn("paiement reçu que la commande n'attendait pas : remboursement à faire");
      }
      return paid;
    });
  }

  /** Essais sans réponse dans les délais : notés expirés (tâche planifiée). Renvoie le nombre traité. */
  async expireStale(now = this.clock()): Promise<number> {
    let count = 0;
    for (const id of await this.payments.findStale(now, 200)) {
      try {
        const done = await this.orders.transaction(async () => {
          const payment = await this.payments.lock(id);
          if (
            !payment ||
            payment.status !== "pending" ||
            !payment.expiresAt ||
            payment.expiresAt > now
          ) {
            return false;
          }
          await this.payments.complete(id, "expired", now, "sans_reponse");
          return true;
        });
        if (done) count++;
      } catch (error) {
        this.logger.warn(
          `expiration impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
        );
      }
    }
    return count;
  }
}

function unavailable(): PaymentsError {
  return new PaymentsError(
    "PAIEMENT_INDISPONIBLE",
    "le paiement Mobile Money ne répond pas pour le moment : réessayez dans quelques minutes",
  );
}

function paymentNotFound(): PaymentsError {
  return new PaymentsError("PAIEMENT_INTROUVABLE", "paiement introuvable");
}
