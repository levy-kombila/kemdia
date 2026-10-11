import { PaymentProviderError, type PaymentProvider } from "../application/ports.js";

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
 * Opérateur simulé (S5-T05, `SandboxOperator`) seulement sur le poste de développement, la démo et les tests ; jamais
 * en préproduction ni en production, même si `NODE_ENV` est mal réglé.
 */
export function sandboxEnabled(env: { APP_ENV: string; NODE_ENV: string }): boolean {
  if (env.APP_ENV === "demo") return true;
  return env.APP_ENV === "local" && env.NODE_ENV !== "production";
}
