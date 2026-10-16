import type { ShopStatus, VendorProductStatus } from "@kemdia/contracts/constants";

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
