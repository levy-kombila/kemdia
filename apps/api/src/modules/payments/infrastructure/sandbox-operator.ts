import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import {
  PAYMENT_ATTEMPT_MINUTES,
  PAYMENT_SIGNATURE_HEADER,
  SANDBOX_BALANCE,
  SANDBOX_PIN_PATTERN,
} from "@kemdia/contracts/constants";
import {
  PaymentProviderError,
  type PaymentProvider,
  type PaymentRequest,
  type WebhookKey,
} from "../application/ports.js";
import { PaymentsError } from "../domain/payments-error.js";
import { signNotification } from "../domain/webhook-signature.js";

/**
 * Demandes gardées au plus (mémoire), dont par compte, et durée pendant laquelle le téléphone les montre : celle d'un
 * essai (au-delà, l'essai a expiré). Relecture de sécurité du S5-T05 : un compte ne sature pas la démo pour les autres.
 */
const MAX_REQUESTS = 1_000;
const MAX_REQUESTS_PER_ACCOUNT = 10;
const SHOWN_MS = PAYMENT_ATTEMPT_MINUTES * 60_000;
/** Envois d'une notification : 3 essais, 3 s chacun au plus. */
const DELIVERY_ATTEMPTS = 3;
const DELIVERY_TIMEOUT_MS = 3_000;

interface SandboxEntry extends PaymentRequest {
  providerRef: string;
  createdAt: Date;
  state: "pending" | "answered";
}

export interface SandboxRequestView {
  paymentId: string;
  orderReference: string;
  method: "airtel" | "moov";
  amount: number;
  phone: string;
  createdAt: Date;
}

/** Envoie une notification signée (corps brut + en-têtes) ; rend le statut HTTP. Remplaçable dans les tests. */
export type NotificationSender = (
  url: string,
  body: string,
  headers: Record<string, string>,
) => Promise<number>;

const httpSender: NotificationSender = async (url, body, headers) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  return response.status;
};

/**
 * Opérateur Mobile Money SIMULÉ (S5-T05, ADR-0027) — poste de développement et démo seulement, jamais en production.
 *
 * Il joue le rôle de l'opérateur : il reçoit la demande de paiement (port `PaymentProvider`), la montre sur le
 * « téléphone simulé » du client, puis, quand le client valide (code PIN fictif) ou refuse, il envoie une notification
 * SIGNÉE par HTTP à l'API, exactement comme le ferait le vrai opérateur : le chemin de confirmation est le même.
 * Aucun argent ne circule. Demandes gardées en mémoire (perdues au redémarrage : l'essai expire alors en 3 minutes).
 */
export class SandboxOperator implements PaymentProvider {
  readonly name = "simule";
  readonly available = true;
  private readonly logger = new Logger("Opérateur simulé");
  private readonly requests = new Map<string, SandboxEntry>();
  /** Adresse des notifications (l'API elle-même) ; remplaçable dans les tests. */
  webhookUrl: string;
  send: NotificationSender = httpSender;
  clock: () => Date = () => new Date();

  constructor(
    private readonly key: WebhookKey,
    port: number,
  ) {
    this.webhookUrl = `http://127.0.0.1:${port}/api/v1/webhooks/mobile-money`;
  }

  request(payment: PaymentRequest): Promise<{ providerRef: string }> {
    this.prune();
    const mine = [...this.requests.values()].filter((r) => r.accountId === payment.accountId);
    if (this.requests.size >= MAX_REQUESTS || mine.length >= MAX_REQUESTS_PER_ACCOUNT) {
      return Promise.reject(new PaymentProviderError("simulateur saturé"));
    }
    const providerRef = `SIM-${randomUUID()}`;
    this.requests.set(payment.paymentId, {
      ...payment,
      providerRef,
      createdAt: this.clock(),
      state: "pending",
    });
    this.logger.log(`demande de ${payment.amount} FCFA (${payment.method})`);
    return Promise.resolve({ providerRef });
  }

  /** La commande a été annulée : la demande quitte le téléphone simulé (S5-T07). */
  cancel(paymentId: string): void {
    this.requests.delete(paymentId);
  }

  /** Demandes en attente sur le téléphone du compte, de la plus récente à la plus ancienne (20 au plus). */
  pendingFor(accountId: string): SandboxRequestView[] {
    this.prune();
    return [...this.requests.values()]
      .filter((r) => r.accountId === accountId && r.state === "pending")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map((r) => ({
        paymentId: r.paymentId,
        orderReference: r.orderReference,
        method: r.method,
        amount: r.amount,
        phone: r.phone,
        createdAt: r.createdAt,
      }));
  }

  /**
   * Le client valide (code PIN à 4 chiffres) ou refuse sur son téléphone simulé. Solde fictif dépassé : refusé
   * « solde insuffisant ». La notification signée est envoyée à l'API ; la réponse dit ce que l'opérateur a répondu.
   */
  async decide(
    accountId: string,
    paymentId: string,
    decision: "approve" | "decline",
    pin: string | undefined,
  ): Promise<{ status: "succeeded" | "failed"; failureReason: string | null }> {
    this.prune();
    const entry = this.requests.get(paymentId);
    if (!entry || entry.accountId !== accountId || entry.state !== "pending") {
      throw new PaymentsError("DEMANDE_INTROUVABLE", "aucune demande en attente sur ce téléphone");
    }
    if (decision === "approve" && (pin === undefined || !SANDBOX_PIN_PATTERN.test(pin))) {
      throw new PaymentsError("CODE_PIN_INVALIDE", "code PIN : 4 chiffres");
    }
    const failureReason =
      decision === "decline"
        ? "refuse_par_le_client"
        : entry.amount > SANDBOX_BALANCE
          ? "solde_insuffisant"
          : null;
    // Répondu une seule fois, même si deux clics arrivent en même temps
    entry.state = "answered";
    try {
      await this.notify(entry, failureReason);
    } catch {
      entry.state = "pending";
      throw new PaymentsError(
        "PAIEMENT_INDISPONIBLE",
        "l'opérateur simulé n'a pas pu prévenir Kemdia : réessayez dans un instant",
      );
    }
    // Notification acceptée : la demande quitte le téléphone (et la mémoire)
    this.requests.delete(entry.paymentId);
    return { status: failureReason ? "failed" : "succeeded", failureReason };
  }

  private async notify(entry: SandboxEntry, failureReason: string | null): Promise<void> {
    const secret = this.key.secret;
    if (!secret) throw new PaymentProviderError("clé des notifications absente");
    const now = this.clock();
    const seconds = () => Math.floor(this.clock().getTime() / 1000);
    const body = JSON.stringify({
      eventId: randomUUID(),
      type: failureReason ? "payment.failed" : "payment.succeeded",
      paymentId: entry.paymentId,
      providerRef: entry.providerRef,
      ...(failureReason ? { failureReason } : { amount: entry.amount }),
      currency: "XAF",
      occurredAt: now.toISOString(),
    });
    // Même notification (même identifiant) renvoyée si l'API ne répond pas : elle ne sera traitée qu'une fois
    for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt++) {
      const headers = {
        [PAYMENT_SIGNATURE_HEADER]: signNotification(secret, seconds(), body),
      };
      try {
        const status = await this.send(this.webhookUrl, body, headers);
        if (status >= 200 && status < 300) return;
        // Refus définitif de l'API (essai inconnu, signature…) : inutile de renvoyer ; commande occupée (409) ou
        // trop de notifications (429) : à renvoyer, comme le ferait un vrai opérateur
        if (status < 500 && status !== 409 && status !== 429) break;
      } catch {
        // API injoignable : nouvel essai
      }
      if (attempt < DELIVERY_ATTEMPTS) await new Promise((r) => setTimeout(r, 200 * attempt));
    }
    this.logger.warn("notification non acceptée par l'API");
    throw new PaymentProviderError("notification non acceptée");
  }

  /** Oublie les demandes trop anciennes (le téléphone ne les montre plus, l'essai a expiré). */
  private prune(): void {
    const limit = this.clock().getTime() - SHOWN_MS;
    for (const [id, entry] of this.requests) {
      if (entry.createdAt.getTime() < limit) this.requests.delete(id);
    }
  }
}

/** Jeton d'injection : l'opérateur simulé, ou `null` hors du poste de développement et de la démo. */
export const SANDBOX_OPERATOR = Symbol("SANDBOX_OPERATOR");
