import {
  IDENTITY_ERROR_CODES,
  SHIPPING_LIMITS,
  COUPON_PERCENT_MAX,
  type CouponErrorCode,
  type IdentityErrorCode,
  type PaymentErrorCode,
  type ReviewErrorCode,
  type ProblemErrorCode,
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
  | "ANNULATION_IMPOSSIBLE"
  | PaymentErrorCode
  | CouponErrorCode
  | ReviewErrorCode
  | ProblemErrorCode
  | "INDISPONIBLE";

/** Finance (S7.5-T05) : paiements, factures, remboursements, encaissements, codes promo. */
const FINANCE_MESSAGES: Record<
  PaymentErrorCode | CouponErrorCode | "ANNULATION_IMPOSSIBLE",
  string
> = {
  PAIEMENT_IMPOSSIBLE: "Paiement impossible pour cette commande.",
  PAIEMENT_EN_COURS: "Un paiement est en cours pour cette commande. Réessayez dans un instant.",
  TROP_D_ESSAIS_PAIEMENT: "Trop d'essais de paiement pour cette commande.",
  PAIEMENT_INDISPONIBLE: "Le paiement Mobile Money est momentanément indisponible.",
  PAIEMENT_INTROUVABLE: "Ce paiement n'existe pas.",
  REMBOURSEMENT_INTROUVABLE: "Ce remboursement n'existe pas.",
  REMBOURSEMENT_DEJA_FAIT:
    "Ce remboursement est déjà noté fait, avec une autre référence. La page a été rechargée.",
  ENCAISSEMENT_IMPOSSIBLE:
    "Encaissement refusé : le montant doit être exactement le total, et la commande ne doit pas être annulée.",
  SIGNATURE_INVALIDE: "Notification refusée.",
  NOTIFICATION_EXPIREE: "Notification expirée.",
  DEMANDE_INTROUVABLE: "Cette demande n'existe pas.",
  CODE_PIN_INVALIDE: "Code PIN refusé.",
  FACTURE_INTROUVABLE: "Cette facture n'existe pas.",
  ENVOI_IMPOSSIBLE:
    "Renvoi impossible : envoi automatique encore en cours, client sans e-mail vérifié, ou facture renvoyée il y a moins de 10 minutes.",
  ANNULATION_IMPOSSIBLE:
    "Action impossible pour cette commande (déjà expédiée, ou un vendeur n'a pas encore répondu).",
  COUPON_INVALIDE: `Code promo refusé : vérifiez le code (4 à 20 lettres, chiffres ou tirets), la valeur (1 à ${COUPON_PERCENT_MAX} % ou un montant), le minimum d'articles (obligatoire et supérieur au montant fixe) et les dates.`,
  COUPON_EXPIRE: "Ce code promo a expiré.",
  COUPON_EPUISE: "Ce code promo n'a plus d'utilisation disponible.",
  COUPON_DEJA_UTILISE: "Ce code promo a déjà été utilisé.",
  COUPON_MINIMUM_NON_ATTEINT: "Montant minimum non atteint.",
  COUPON_NON_APPLICABLE: "Ce code promo ne s'applique pas.",
  COUPON_EXISTE: "Ce code promo existe déjà : choisissez-en un autre.",
  COUPON_INTROUVABLE: "Ce code promo n'existe pas.",
  COUPON_TROP_D_ESSAIS: "Trop d'essais de codes promo.",
};

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
  FICHE_INTROUVABLE: "Fiche introuvable.",
  FICHE_PUBLIEE: "Cette fiche est en ligne : seule l'équipe peut la modifier.",
  FICHE_NON_PUBLIEE: "Cette fiche n'est pas en ligne.",
  DEJA_EN_VENTE: "Cette boutique vend déjà ce produit.",
  DECLINAISON_INTROUVABLE: "Déclinaison introuvable sur cette fiche.",
  FUSION_IMPOSSIBLE: "Fusion impossible : vérifiez les boutiques et les déclinaisons.",
  CORRECTION_INTROUVABLE: "Proposition introuvable.",
  TROP_DE_CORRECTIONS: "Trop de propositions en attente pour cette boutique.",
};

/** Avis des clients (S8-T01). */
const REVIEW_MESSAGES: Record<ReviewErrorCode, string> = {
  AVIS_INVALIDE: "Motif refusé : écrivez de 5 à 300 caractères.",
  ACHAT_REQUIS: "Seuls les clients qui ont reçu ce produit peuvent donner leur avis.",
  AVIS_INTROUVABLE: "Avis introuvable : il a peut-être été retiré par son auteur.",
  AVIS_DEJA_TRAITE: "Cet avis a déjà été traité. La page a été rechargée.",
  AVIS_MODIFIE:
    "Le client a modifié son avis pendant votre lecture : relisez le nouveau texte avant de décider.",
};
const isReviewCode = (code: StaffMessageCode): code is ReviewErrorCode =>
  Object.hasOwn(REVIEW_MESSAGES, code);

/** Signalements (S8-T02). */
const PROBLEM_MESSAGES: Record<ProblemErrorCode, string> = {
  SIGNALEMENT_INVALIDE: "Signalement refusé : décrivez le problème en 10 à 2 000 caractères.",
  TROP_DE_SIGNALEMENTS: "Trop de signalements en attente pour ce compte.",
  SIGNALEMENT_INTROUVABLE:
    "Signalement introuvable : il a peut-être été effacé avec le compte de son auteur.",
  SIGNALEMENT_MODIFIE:
    "Ce signalement vient d'être modifié par un collègue. La page a été rechargée : vérifiez avant de recommencer.",
};
const isProblemCode = (code: StaffMessageCode): code is ProblemErrorCode =>
  Object.hasOwn(PROBLEM_MESSAGES, code);

const isIdentityCode = (value: string): value is IdentityErrorCode =>
  (IDENTITY_ERROR_CODES as readonly string[]).includes(value);

const isVendorCode = (code: StaffMessageCode): code is VendorErrorCode => code in VENDOR_MESSAGES;
const isShippingCode = (code: StaffMessageCode): code is keyof typeof SHIPPING_MESSAGES =>
  Object.hasOwn(SHIPPING_MESSAGES, code);
const isFinanceCode = (code: StaffMessageCode): code is keyof typeof FINANCE_MESSAGES =>
  Object.hasOwn(FINANCE_MESSAGES, code);

/** Message en français pour une erreur de l'espace de l'équipe. */
export function staffErrorMessage(code: StaffMessageCode, retryAfterSeconds?: number): string {
  if (isVendorCode(code)) return VENDOR_MESSAGES[code];
  if (isShippingCode(code)) return SHIPPING_MESSAGES[code];
  if (isFinanceCode(code)) return FINANCE_MESSAGES[code];
  if (isReviewCode(code)) return REVIEW_MESSAGES[code];
  if (isProblemCode(code)) return PROBLEM_MESSAGES[code];
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
  // Fiches communes (S7.5-T03)
  "fiche-corrigee": "Fiche corrigée : toutes les boutiques qui la vendent la montrent déjà.",
  "photo-fiche-retiree": "Photo retirée de la fiche et effacée.",
  "fiche-fusionnee":
    "Doublon fusionné : ses offres sont sur cette fiche, son ancienne adresse y mène.",
  "offre-retiree": "Offre retirée : le vendeur voit votre motif.",
  "correction-close": "Proposition close.",
  // Avis des clients (S8-T01)
  "avis-publie": "Avis publié : il compte maintenant dans la note du produit.",
  "avis-refuse": "Avis refusé : son auteur voit le motif et peut le corriger.",
  // Bêta fermée et signalements (S8-T02)
  "beta-fermee": "Inscription réservée aux invités : les comptes existants se connectent toujours.",
  "beta-ouverte": "Inscription ouverte à tous.",
  "invitation-envoyee": "Invitation enregistrée et envoyée par e-mail (valable 30 jours).",
  "invitation-a-prevenir":
    "Invitation enregistrée (valable 30 jours). Aucun e-mail possible pour cette adresse : prévenez la personne vous-même.",
  "invitation-annulee": "Invitation annulée : cette adresse ne peut plus créer de compte.",
  "signalement-en-cours": "Signalement pris en charge.",
  "signalement-resolu": "Signalement résolu : il sera effacé dans 180 jours.",
  "signalement-rouvert": "Signalement rouvert.",
  // Équipe (S7.5-T04)
  "role-accorde":
    "Rôle accordé : il s'applique dès la prochaine page (double authentification exigée).",
  "role-retire": "Rôle retiré : il ne s'applique plus, dès maintenant.",
  "equipe-retiree":
    "Rôles de l'équipe retirés et sessions fermées : la personne redevient cliente.",
  "compte-desactive": "Compte désactivé : plus aucune connexion possible, sessions fermées.",
  "compte-reactive": "Compte réactivé : la personne peut de nouveau se connecter.",
  // Finance (S7.5-T05)
  "facture-renvoyee": "Facture renvoyée au client par e-mail.",
  "especes-encaissees": "Encaissement noté : la commande est payée et sa facture est établie.",
  "remboursement-fait": "Remboursement noté fait.",
  "code-cree": "Code promo créé : il est actif tout de suite (ou à sa date de début).",
  "code-active": "Code promo activé.",
  "code-desactive": "Code promo désactivé : il ne s'applique plus aux nouvelles commandes.",
  "facturation-enregistree":
    "Informations de facturation enregistrées : elles figureront sur les prochaines factures.",
  "livraison-enregistree": "Réglage du paiement à la livraison enregistré.",
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
/** Refus du site lui-même (avant tout appel à l'API). */
const SITE_MESSAGES: Record<string, string> = {
  CONFIRMATION_REQUISE:
    "Cochez « Je confirme » avant de retirer les rôles ou de désactiver le compte.",
  REFERENCE_INVALIDE:
    "Référence refusée : 3 à 100 caractères (lettres, chiffres, points, tirets, barres obliques).",
  REGLAGES_INVALIDES:
    "Réglage refusé : remplissez tous les champs (adresse e-mail valide, montants entiers).",
};

export function staffErrorFromParam(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Z_]{3,40}$/.test(value)) return null;
  if (Object.hasOwn(SITE_MESSAGES, value)) return SITE_MESSAGES[value] ?? null;
  if (
    value === "INDISPONIBLE" ||
    Object.hasOwn(VENDOR_MESSAGES, value) ||
    Object.hasOwn(SHIPPING_MESSAGES, value) ||
    Object.hasOwn(FINANCE_MESSAGES, value) ||
    Object.hasOwn(REVIEW_MESSAGES, value) ||
    Object.hasOwn(PROBLEM_MESSAGES, value) ||
    isIdentityCode(value)
  )
    return staffErrorMessage(value as StaffMessageCode);
  return null;
}
