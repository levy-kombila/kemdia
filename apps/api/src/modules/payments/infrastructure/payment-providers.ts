import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import {
  PaymentProviderError,
  type PaymentProvider,
  type PaymentRequest,
} from "../application/ports.js";

/**
 * Aucun fournisseur Mobile Money branché (production et préproduction tant que le client n'a pas choisi entre un
 * agrégateur et les opérateurs, question ouverte n° 7) : chaque essai est refusé avec `PAIEMENT_INDISPONIBLE`.
 */
export class UnavailablePaymentProvider implements PaymentProvider {
  readonly name = "aucun";
  readonly available = false;

  request(): Promise<{ providerRef: string }> {
    return Promise.reject(new PaymentProviderError("aucun fournisseur Mobile Money"));
  }
}

/**
 * Fournisseur simulé (poste de développement et démo seulement, jamais en production) : accepte la demande et rend une
 * référence « SIM-… ». Aucun argent ne circule ; le résultat est transmis par le simulateur du bac à sable (S5-T05).
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = "simule";
  readonly available = true;
  private readonly logger = new Logger("Paiement simulé");

  request(payment: PaymentRequest): Promise<{ providerRef: string }> {
    this.logger.log(
      `demande de ${payment.amount} FCFA (${payment.method}) pour ${payment.orderReference}`,
    );
    return Promise.resolve({ providerRef: `SIM-${randomUUID()}` });
  }
}

/** Choix du fournisseur : simulé seulement sur le poste de développement, la démo et les tests. */
export function choosePaymentProvider(env: { APP_ENV: string; NODE_ENV: string }): PaymentProvider {
  const simulated =
    env.NODE_ENV !== "production"
      ? env.APP_ENV === "local" || env.APP_ENV === "demo"
      : env.APP_ENV === "demo";
  return simulated ? new SimulatedPaymentProvider() : new UnavailablePaymentProvider();
}
