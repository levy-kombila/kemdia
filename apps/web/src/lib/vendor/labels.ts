import type {
  OrderStatus,
  KycDocumentKind,
  KycIdType,
  KycPayoutMethod,
  KycStatus,
  ShopStatus,
  VendorOrderStatus,
  VendorProductStatus,
} from "@kemdia/contracts/constants";

/** Libellés vus par le vendeur (S6-T06) : le texte porte le sens, la couleur n'est qu'un repère. */
export type Tone = "wait" | "ok" | "bad" | "off";

export const PRODUCT_STATUS: Record<
  VendorProductStatus,
  { label: string; tab: string; tone: Tone }
> = {
  draft: { label: "Brouillon", tab: "Brouillons", tone: "off" },
  pending: { label: "En attente de validation", tab: "En attente", tone: "wait" },
  published: { label: "En ligne", tab: "En ligne", tone: "ok" },
  rejected: { label: "Refusé", tab: "Refusés", tone: "bad" },
  archived: { label: "Retiré de la vente", tab: "Retirés", tone: "off" },
};

/** Onglets de « Mes produits » (le brouillon n'existe pas encore à l'écran : tout produit part en modération). */
export const PRODUCT_TABS = ["published", "pending", "rejected", "archived"] as const;

export const SHOP_STATUS: Record<ShopStatus, { label: string; tone: Tone }> = {
  pending: { label: "Demande en cours d'examen", tone: "wait" },
  active: { label: "Boutique active", tone: "ok" },
  rejected: { label: "Demande refusée", tone: "bad" },
  suspended: { label: "Boutique suspendue", tone: "off" },
};

/** Curseur de page renvoyé par l'API : relu dans l'adresse, jamais transmis s'il a une autre forme. */
export const CURSOR = /^[A-Za-z0-9_-]{20,120}$/;

/** Commandes vues par le vendeur (S6-T07) : où en est SA part de la commande. */
export const ORDER_STATUS: Record<VendorOrderStatus, { label: string; tab: string; tone: Tone }> = {
  pending: { label: "À accepter ou refuser", tab: "À traiter", tone: "wait" },
  accepted: { label: "Acceptée", tab: "Acceptées", tone: "ok" },
  refused: { label: "Refusée", tab: "Refusées", tone: "bad" },
  expired: { label: "Sans réponse à temps", tab: "Sans réponse", tone: "bad" },
  cancelled: { label: "Annulée", tab: "Annulées", tone: "off" },
};

/**
 * Livraison d'une commande acceptée (S7-T02), en lecture seule : l'équipe Kemdia remet le colis au transporteur et
 * suit la livraison. `null` : rien à montrer (commande pas encore acceptée par toutes les boutiques…).
 */
export function deliveryState(
  part: VendorOrderStatus,
  order: OrderStatus,
): { label: string; tone: Tone } | null {
  if (part !== "accepted") return null;
  if (order === "preparing") return { label: "En attente du livreur", tone: "wait" };
  if (order === "shipped") return { label: "En livraison", tone: "wait" };
  if (order === "delivered") return { label: "Livrée au client", tone: "ok" };
  if (order === "cancelled") return { label: "Commande annulée", tone: "off" };
  return null;
}

/** Onglets de « Mes commandes » : ce qui attend une réponse d'abord. */
export const ORDER_TABS = ["pending", "accepted", "refused", "expired", "cancelled"] as const;

/** Vérification du vendeur, KYC (S6-T08). */
export const KYC_STATUS: Record<KycStatus, { label: string; tone: Tone }> = {
  draft: { label: "À compléter", tone: "wait" },
  pending: { label: "En cours de vérification", tone: "wait" },
  approved: { label: "Vérifié", tone: "ok" },
  rejected: { label: "Refusé : à corriger", tone: "bad" },
};
export const ID_TYPE_LABEL: Record<KycIdType, string> = {
  cni: "Carte nationale d'identité",
  passeport: "Passeport",
  carte_sejour: "Carte de séjour",
};
export const PAYOUT_LABEL: Record<KycPayoutMethod, string> = {
  airtel: "Airtel Money",
  moov: "Moov Money",
  bank: "Compte bancaire",
};
export const DOCUMENT_LABEL: Record<KycDocumentKind, string> = {
  id_front: "Pièce d'identité — recto",
  id_back: "Pièce d'identité — verso",
  rccm: "Extrait RCCM",
};
/** Champ signalé après un refus de l'API (`?champ=…`, liste fermée). */
export const KYC_FIELD_LABEL: Record<string, string> = {
  legalName: "le nom sur la pièce",
  idNumber: "le numéro de la pièce",
  rccmNumber: "le numéro RCCM",
  payoutAccount: "le compte de versement (Airtel : 07…, Moov : 06…, banque : RIB ou IBAN)",
  payoutHolder: "le titulaire du compte",
};
