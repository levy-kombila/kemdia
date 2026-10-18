import {
  IDENTITY_ERROR_CODES,
  SHIPPING_LIMITS,
  type IdentityErrorCode,
  type ShippingErrorCode,
  type VendorErrorCode,
} from "@kemdia/contracts/constants";
import { authErrorMessage, formatWait } from "@/lib/auth/messages";

/**
 * Messages de l'espace de l'équipe (S6-T05). Les codes de l'identité réutilisent les messages du S4 ; les codes des
 * boutiques et de la modération sont écrits pour l'équipe (le vendeur a ses propres messages, plus tard au S6).
 */
export type StaffMessageCode =
  | IdentityErrorCode
  | VendorErrorCode
  | ShippingErrorCode
  | "COMMANDE_INTROUVABLE"
  | "PANIER_OCCUPE"
  | "INDISPONIBLE";

/** Livraisons (S7-T02) et codes des commandes renvoyés par leurs routes. */
const SHIPPING_MESSAGES: Record<
  ShippingErrorCode | "COMMANDE_INTROUVABLE" | "PANIER_OCCUPE",
  string
> = {
  EXPEDITION_INTROUVABLE: "Cette commande n'a pas encore été remise au transporteur.",
  EXPEDITION_IMPOSSIBLE:
    "Action impossible pour cette commande (paiement attendu, vendeur qui n'a pas répondu, ou espèces déjà encaissées). La page a été rechargée.",
  STATUT_EXPEDITION_INCOMPATIBLE:
    "Cette étape n'est plus possible : la livraison a changé entre-temps. La page a été rechargée.",
  EXPEDITION_INVALIDE: `Texte refusé : ${SHIPPING_LIMITS.reasonMin} à ${SHIPPING_LIMITS.reasonMax} caractères.`,
  TARIFS_INVALIDES:
    "Barème refusé : montants entiers dans les bornes, délai minimum inférieur ou égal au maximum.",
  COMMANDE_INTROUVABLE: "Cette commande n'existe pas.",
  PANIER_OCCUPE: "Une autre opération est en cours sur cette commande. Réessayez dans un instant.",
};

const VENDOR_MESSAGES: Record<VendorErrorCode, string> = {
  // Vérification des vendeurs (S6-T08)
  KYC_INVALIDE: "Motif refusé : 5 à 300 caractères.",
  KYC_INTROUVABLE: "Aucun dossier envoyé pour cette boutique.",
  KYC_INCOMPLET: "Le dossier est incomplet.",
  STATUT_KYC_INCOMPATIBLE:
    "Ce dossier n'attend plus de décision : il a déjà été examiné. La page a été rechargée.",
  KYC_INDISPONIBLE:
    "Vérification indisponible : la clé de chiffrement KYC_ENCRYPTION_KEY manque sur le serveur.",
  DOCUMENT_INTROUVABLE: "Photo absente (jamais envoyée, ou effacée 30 jours après la décision).",
  BOUTIQUE_INVALIDE: "Motif refusé : 5 à 300 caractères.",
  BOUTIQUE_EXISTE: "Ce compte a déjà une boutique.",
  NOM_BOUTIQUE_PRIS: "Ce nom de boutique est déjà pris.",
  BOUTIQUE_INTROUVABLE: "Cette boutique n'existe pas (ou plus).",
  STATUT_BOUTIQUE_INCOMPATIBLE:
    "Cette décision n'est plus possible : la boutique a changé de statut entre-temps. La page a été rechargée.",
  BOUTIQUE_SUR_SOI_INTERDITE: "Vous ne pouvez pas décider pour votre propre boutique.",
  PROPRIETAIRE_INACTIF:
    "Le compte du vendeur n'est pas actif : la boutique ne peut pas être validée.",
  BOUTIQUE_OCCUPEE:
    "Une autre opération est en cours sur cette boutique. Réessayez dans un instant.",
  BOUTIQUE_INACTIVE: "La boutique de ce produit n'est pas active.",
  PRODUIT_INVALIDE: "Motif refusé : 5 à 300 caractères.",
  CATEGORIE_INCONNUE: "Catégorie inconnue.",
  PRODUIT_INTROUVABLE: "Ce produit n'existe pas (ou plus).",
  VARIANTE_INTROUVABLE: "Variante introuvable.",
  STATUT_PRODUIT_INCOMPATIBLE:
    "Ce produit n'attend plus de décision : il a déjà été examiné. La page a été rechargée.",
  PRODUIT_SUR_SOI_INTERDIT: "Vous ne pouvez pas modérer un produit de votre propre boutique.",
  STOCK_MODIFIE: "Le stock a changé entre-temps.",
  PRODUIT_MODIFIE:
    "Le vendeur a modifié ce produit pendant que vous le lisiez. Relisez la nouvelle version avant de décider.",
  TROP_DE_PRODUITS_EN_ATTENTE: "Trop de produits en attente pour cette boutique.",
  FORMAT_IMAGE_INVALIDE: "Format de photo refusé.",
  IMAGE_TROP_GRANDE: "Photo trop lourde.",
  IMAGE_TROP_PETITE: "Photo trop petite.",
  TROP_DE_PHOTOS: "Trop de photos pour ce produit.",
  PHOTO_INTROUVABLE: "Photo introuvable.",
};

const isIdentityCode = (value: string): value is IdentityErrorCode =>
  (IDENTITY_ERROR_CODES as readonly string[]).includes(value);

const isVendorCode = (code: StaffMessageCode): code is VendorErrorCode => code in VENDOR_MESSAGES;
const isShippingCode = (code: StaffMessageCode): code is keyof typeof SHIPPING_MESSAGES =>
  Object.hasOwn(SHIPPING_MESSAGES, code);

/** Message en français pour une erreur de l'espace de l'équipe. */
export function staffErrorMessage(code: StaffMessageCode, retryAfterSeconds?: number): string {
  if (isVendorCode(code)) return VENDOR_MESSAGES[code];
  if (isShippingCode(code)) return SHIPPING_MESSAGES[code];
  // 2FA : un code faux n'a rien à voir avec un code reçu par e-mail
  if (code === "CODE_INVALIDE")
    return "Code incorrect. Saisissez le code à 6 chiffres affiché maintenant dans votre application, ou un code de secours.";
  // 3 codes faux en 15 minutes : l'API ferme la session et bloque la 2FA 15 minutes (ADR-0034)
  if (code === "TROP_D_ESSAIS")
    return `Trop de codes faux : par sécurité, vous avez été déconnecté. Reconnectez-vous dans ${formatWait(retryAfterSeconds ?? 15 * 60)}.`;
  return authErrorMessage({ code, retryAfterSeconds });
}

/** Messages courts passés dans l'adresse après une décision (`?ok=…`) : liste fermée, jamais du texte libre. */
export const STAFF_NOTICES = {
  "boutique-validee": "Boutique validée : le vendeur peut maintenant vendre.",
  "kyc-valide":
    "Dossier validé : les versements à ce vendeur deviennent possibles. Photos effacées dans 30 jours.",
  "kyc-refuse": "Dossier refusé : le vendeur voit le motif et peut le corriger.",
  "boutique-refusee": "Demande refusée : le vendeur voit votre motif et peut redemander.",
  "boutique-suspendue":
    "Boutique suspendue : ses produits sont cachés et le rôle vendeur est retiré.",
  "produit-valide": "Produit validé : il est maintenant visible sur le site.",
  "produit-refuse": "Produit refusé : le vendeur voit votre motif.",
  // Livraisons (S7-T02)
  "livraison-remise": "Commande remise au transporteur : le client reçoit un e-mail « en route ».",
  "livraison-livree": "Commande notée livrée : le client reçoit un e-mail.",
  "livraison-echec": "Échec noté. Relancez une tentative, ou annulez la commande.",
  "livraison-relancee": "Nouvelle tentative de livraison : la commande est de nouveau en route.",
  "livraison-annulee":
    "Commande annulée : stock et coupon rendus ; un paiement Mobile Money est à rembourser (liste des remboursements).",
  "bareme-enregistre": "Barème enregistré : le site l'affiche dans 5 minutes au plus.",
} as const;
export type StaffNotice = keyof typeof STAFF_NOTICES;

export function staffNotice(value: unknown): string | null {
  return typeof value === "string" && Object.hasOwn(STAFF_NOTICES, value)
    ? STAFF_NOTICES[value as StaffNotice]
    : null;
}

/**
 * Code d'erreur lu dans l'adresse (`?erreur=…`, après une décision refusée) : seulement un code connu, sinon rien.
 * Le texte affiché vient toujours de ce fichier, jamais de l'adresse.
 */
export function staffErrorFromParam(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Z_]{3,40}$/.test(value)) return null;
  if (
    value === "INDISPONIBLE" ||
    Object.hasOwn(VENDOR_MESSAGES, value) ||
    Object.hasOwn(SHIPPING_MESSAGES, value) ||
    isIdentityCode(value)
  )
    return staffErrorMessage(value as StaffMessageCode);
  return null;
}
