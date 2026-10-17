import type {
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

/** Onglets de « Mes commandes » : ce qui attend une réponse d'abord. */
export const ORDER_TABS = ["pending", "accepted", "refused", "expired", "cancelled"] as const;
