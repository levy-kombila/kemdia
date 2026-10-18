import type { ShipmentStatus, ShopStatus, VendorProductStatus } from "@kemdia/contracts/constants";

/** Libellés et couleurs des statuts (S6-T05) : le texte porte le sens, la couleur n'est qu'un repère. */
export type Tone = "wait" | "ok" | "bad" | "off";

export const SHOP_STATUS: Record<ShopStatus, { label: string; tab: string; tone: Tone }> = {
  pending: { label: "À examiner", tab: "À examiner", tone: "wait" },
  active: { label: "Active", tab: "Actives", tone: "ok" },
  rejected: { label: "Refusée", tab: "Refusées", tone: "bad" },
  suspended: { label: "Suspendue", tab: "Suspendues", tone: "off" },
};

export const PRODUCT_STATUS: Record<VendorProductStatus, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "off" },
  pending: { label: "À modérer", tone: "wait" },
  published: { label: "En ligne", tone: "ok" },
  rejected: { label: "Refusé", tone: "bad" },
  archived: { label: "Archivé", tone: "off" },
};

/** Onglets de la file de modération (ceux que l'API sait lister). */
export const MODERATION_TABS = [
  { status: "pending", label: "À modérer" },
  { status: "published", label: "Validés" },
  { status: "rejected", label: "Refusés" },
] as const;
export type ModerationTab = (typeof MODERATION_TABS)[number]["status"];

/** Curseur de page renvoyé par l'API (`nextCursor`) : relu dans l'adresse, jamais transmis s'il a une autre forme. */
export const CURSOR = /^[A-Za-z0-9_-]{20,120}$/;

/** Dossiers de vérification des vendeurs (S6-T08) : l'équipe ne voit que les dossiers envoyés. */
export const KYC_STATUS = {
  pending: { label: "À vérifier", tab: "À vérifier", tone: "wait" },
  approved: { label: "Vérifié", tab: "Vérifiés", tone: "ok" },
  rejected: { label: "Refusé", tab: "Refusés", tone: "bad" },
  draft: { label: "En préparation", tab: "En préparation", tone: "off" },
} as const satisfies Record<string, { label: string; tab: string; tone: Tone }>;
export const KYC_TABS = ["pending", "approved", "rejected"] as const;

/** Livraisons (S7-T02) : « Prêtes » = commandes sans expédition ; les autres onglets = statut de l'expédition. */
export const SHIPMENT_STATUS: Record<ShipmentStatus, { label: string; tab: string; tone: Tone }> = {
  in_transit: { label: "En route", tab: "En route", tone: "wait" },
  failed: { label: "Échec de livraison", tab: "Échecs", tone: "bad" },
  delivered: { label: "Livrée", tab: "Livrées", tone: "ok" },
  cancelled: { label: "Annulée", tab: "Annulées", tone: "off" },
};
export const SHIPPING_TABS = ["ready", "in_transit", "failed", "delivered", "cancelled"] as const;
export type ShippingTab = (typeof SHIPPING_TABS)[number];
export const SHIPPING_TAB_LABEL: Record<ShippingTab, string> = {
  ready: "Prêtes",
  in_transit: SHIPMENT_STATUS.in_transit.tab,
  failed: SHIPMENT_STATUS.failed.tab,
  delivered: SHIPMENT_STATUS.delivered.tab,
  cancelled: SHIPMENT_STATUS.cancelled.tab,
};
