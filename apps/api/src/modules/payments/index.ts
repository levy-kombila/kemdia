/**
 * Port public du module payments : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * S5-T04 : essais de paiement, remboursements ; `PaymentService.applyProviderResult` recevra les notifications du
 * fournisseur (S5-T05).
 */
export { PaymentsModule } from "./payments.module.js";
export { PaymentService, type ProviderResult } from "./application/payment.service.js";
export {
  PAYMENT_PROVIDER,
  PaymentProviderError,
  type PaymentProvider,
} from "./application/ports.js";
export { PaymentsError, type PaymentsErrorCode } from "./domain/payments-error.js";
