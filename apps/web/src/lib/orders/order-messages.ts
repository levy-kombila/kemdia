import {
  MAX_OPEN_ORDERS,
  MAX_PAYMENT_ATTEMPTS,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@kemdia/contracts/constants";
import type { OrderFailureCode } from "./api-orders";

/** Messages du tunnel de commande et de « Mes commandes » (S5-T07), en français simple. */
const MESSAGES: Record<OrderFailureCode, string> = {
  // Commandes
  PANIER_VIDE: "Votre panier est vide : ajoutez des articles avant de commander.",
  PANIER_A_VERIFIER:
    "Certains articles ne sont plus disponibles comme demandé (stock ou produit retiré). Vérifiez votre panier.",
  PRIX_MODIFIE: "Le total a changé depuis l'affichage : vérifiez le nouveau montant.",
  ADRESSE_INVALIDE: "L'adresse de livraison est incomplète : vérifiez chaque champ.",
  NUMERO_PAIEMENT_INVALIDE:
    "Ce numéro ne correspond pas à l'opérateur choisi (07… Airtel, 06… Moov).",
  PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE:
    "Le paiement à la livraison n'est pas possible pour cette ville ou ce montant.",
  MOBILE_MONEY_INDISPONIBLE:
    "Le paiement Mobile Money n'est pas encore disponible : choisissez le paiement à la livraison.",
  COMMANDE_INTROUVABLE: "Cette commande est introuvable.",
  DECISION_IMPOSSIBLE: "Cette commande ne peut plus être acceptée ou refusée.",
  MOTIF_REFUS_INVALIDE: "Indiquez un motif de refus de 5 à 300 caractères.",
  ANNULATION_IMPOSSIBLE: "Cette commande ne peut plus être annulée (déjà expédiée ou livrée).",
  CLE_DEJA_UTILISEE:
    "Une commande a peut-être déjà été enregistrée lors d'un envoi précédent : vérifiez vos commandes avant de recommencer.",
  TROP_DE_COMMANDES_OUVERTES: `Vous avez déjà ${MAX_OPEN_ORDERS} commandes en cours : payez-en ou annulez-en une avant d'en passer une autre.`,
  PANIER_OCCUPE: "Votre panier est en cours de modification : réessayez dans un instant.",
  // Coupons
  COUPON_INVALIDE: "Ce code promo n'est pas valable.",
  COUPON_EXPIRE: "Ce code promo a expiré (ou n'est pas encore valable).",
  COUPON_EPUISE: "Ce code promo a déjà été utilisé autant de fois que prévu.",
  COUPON_DEJA_UTILISE: "Vous avez déjà utilisé ce code promo.",
  COUPON_MINIMUM_NON_ATTEINT: "Le montant minimum d'articles pour ce code promo n'est pas atteint.",
  COUPON_NON_APPLICABLE:
    "Ce code promo ne s'applique pas à ces articles (articles déjà en promotion).",
  COUPON_EXISTE: "Ce code promo n'est pas valable.",
  COUPON_INTROUVABLE: "Ce code promo n'est pas valable.",
  COUPON_TROP_D_ESSAIS: "Trop de codes refusés : patientez quelques minutes avant de réessayer.",
  // Paiements
  PAIEMENT_IMPOSSIBLE:
    "Cette commande n'attend plus de paiement (déjà payée, annulée ou délai dépassé).",
  PAIEMENT_EN_COURS: "Une demande de paiement est déjà en attente sur votre téléphone.",
  TROP_D_ESSAIS_PAIEMENT: `Vous avez utilisé vos ${MAX_PAYMENT_ATTEMPTS} essais de paiement (ou trop de demandes vers ce numéro).`,
  PAIEMENT_INDISPONIBLE:
    "L'opérateur Mobile Money ne répond pas pour le moment. Réessayez dans un instant.",
  PAIEMENT_INTROUVABLE: "Aucune demande de paiement n'a encore été envoyée.",
  FACTURE_INTROUVABLE: "Cette facture est introuvable.",
  // Communs
  SESSION_INVALIDE: "Votre session a expiré : reconnectez-vous.",
  TROP_DE_REQUETES: "Trop de demandes d'un coup : patientez une minute.",
  INDISPONIBLE: "Le service ne répond pas pour le moment. Réessayez dans un instant.",
};

export function orderMessage(code: OrderFailureCode): string {
  return MESSAGES[code];
}

/** Un code promo refusé (affiché sous le champ du code, pas en haut du tunnel). */
export const isCouponCode = (code: OrderFailureCode): boolean => code.startsWith("COUPON_");

export function statusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status];
}

/** Raisons d'échec d'un essai Mobile Money (champ `failureReason` de l'API), en clair. */
const PAYMENT_FAILURES: Record<string, string> = {
  solde_insuffisant: "solde insuffisant",
  refuse_par_le_client: "paiement refusé sur le téléphone",
  sans_reponse: "pas de validation à temps",
  operateur_indisponible: "opérateur injoignable",
  commande_annulee: "commande annulée",
  commande_payee: "commande déjà payée",
};

export function paymentFailureLabel(reason: string | null): string {
  if (!reason) return "paiement non abouti";
  return PAYMENT_FAILURES[reason] ?? "paiement non abouti";
}
