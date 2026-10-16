import {
  IDENTITY_ERROR_CODES,
  VENDOR_ERROR_CODES,
  type IdentityErrorCode,
  type VendorErrorCode,
} from "@kemdia/contracts/constants";
import { authErrorMessage } from "@/lib/auth/messages";

/**
 * Messages de l'espace vendeur (S6-T06), écrits pour le vendeur (l'équipe a les siens, S6-T05). Le texte affiché vient
 * toujours d'ici ; l'explication de l'API n'est ajoutée que pour un champ mal rempli.
 */
export type VendorMessageCode = IdentityErrorCode | VendorErrorCode | "INDISPONIBLE";

const MESSAGES: Record<VendorErrorCode, string> = {
  BOUTIQUE_INVALIDE: "Vérifiez les champs de votre demande.",
  BOUTIQUE_EXISTE: "Vous avez déjà une boutique (ou une demande en cours).",
  NOM_BOUTIQUE_PRIS: "Ce nom de boutique est déjà pris. Choisissez-en un autre.",
  BOUTIQUE_INTROUVABLE: "Vous n'avez pas encore de boutique.",
  STATUT_BOUTIQUE_INCOMPATIBLE: "Votre boutique ne permet pas cette action pour le moment.",
  BOUTIQUE_SUR_SOI_INTERDITE: "Action impossible sur votre propre boutique.",
  PROPRIETAIRE_INACTIF: "Votre compte n'est pas actif.",
  BOUTIQUE_OCCUPEE:
    "Une autre opération est en cours sur votre boutique. Réessayez dans un instant.",
  BOUTIQUE_INACTIVE: "Votre boutique n'est pas active : vous ne pouvez pas gérer vos produits.",
  PRODUIT_INVALIDE: "Vérifiez les champs du produit.",
  CATEGORIE_INCONNUE: "Choisissez une catégorie dans la liste.",
  PRODUIT_INTROUVABLE: "Ce produit n'existe pas (ou plus) dans votre boutique.",
  VARIANTE_INTROUVABLE: "Cette variante n'existe pas (ou plus).",
  STATUT_PRODUIT_INCOMPATIBLE: "Ce produit ne permet pas cette action dans son état actuel.",
  PRODUIT_SUR_SOI_INTERDIT: "Action impossible sur ce produit.",
  STOCK_MODIFIE:
    "Le stock a changé pendant que vous le modifiiez (une commande vient d'arriver). Voici le stock à jour : recommencez.",
  PRODUIT_MODIFIE: "Le produit a changé entre-temps. La page a été rechargée.",
  TROP_DE_PRODUITS_EN_ATTENTE:
    "Trop de produits attendent déjà la modération (50 au plus). Patientez avant d'en ajouter d'autres.",
  FORMAT_IMAGE_INVALIDE: "Format refusé : envoyez une photo JPEG, PNG ou WebP.",
  IMAGE_TROP_GRANDE: "Photo trop lourde (5 Mo au plus).",
  IMAGE_TROP_PETITE: "Photo trop petite : 200 pixels au moins de chaque côté.",
  TROP_DE_PHOTOS: "10 photos au plus par produit : retirez-en une avant d'en ajouter.",
  PHOTO_INTROUVABLE: "Cette photo n'existe plus.",
};

const isVendorCode = (code: string): code is VendorErrorCode =>
  (VENDOR_ERROR_CODES as readonly string[]).includes(code);
const isIdentityCode = (code: string): code is IdentityErrorCode =>
  (IDENTITY_ERROR_CODES as readonly string[]).includes(code);

export function vendorErrorMessage(code: VendorMessageCode, detail?: string): string {
  if (isVendorCode(code)) {
    const base = MESSAGES[code];
    return detail ? `${base} (${detail})` : base;
  }
  // Rôle vendeur retiré (boutique suspendue entre-temps)
  if (code === "ACCES_REFUSE") return MESSAGES.BOUTIQUE_INACTIVE;
  return authErrorMessage({ code });
}

/** Code d'erreur lu dans l'adresse (`?erreur=…`) : seulement un code connu ; le texte vient toujours d'ici. */
export function vendorErrorFromParam(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Z_]{3,40}$/.test(value)) return null;
  if (value === "INDISPONIBLE" || isVendorCode(value) || isIdentityCode(value))
    return vendorErrorMessage(value as VendorMessageCode);
  return null;
}

/** Avis après une action réussie (`?ok=…`) : liste fermée, jamais du texte libre. */
export const VENDOR_NOTICES = {
  "demande-envoyee": "Demande envoyée : l'équipe Kemdia l'examine. Vous serez prévenu par e-mail.",
  "produit-cree":
    "Produit créé : il attend la modération. Ajoutez maintenant ses photos (la première est la principale).",
  "fiche-modifiee": "Fiche modifiée : le produit repasse en modération (caché en attendant).",
  "variante-modifiee": "Prix et stock enregistrés, sans nouvelle modération.",
  "photo-ajoutee": "Photo ajoutée : le produit repasse en modération.",
  "photo-principale": "Photo principale changée.",
  "photo-retiree": "Photo retirée.",
  "produit-archive": "Produit retiré de la vente.",
  "produit-remis": "Produit remis en vente : il repasse en modération.",
} as const;
export type VendorNotice = keyof typeof VENDOR_NOTICES;

export function vendorNotice(value: unknown): string | null {
  return typeof value === "string" && Object.hasOwn(VENDOR_NOTICES, value)
    ? VENDOR_NOTICES[value as VendorNotice]
    : null;
}
