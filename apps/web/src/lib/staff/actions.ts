"use server";

import {
  ADMIN_ASSIGNABLE_ROLES,
  BETA_INVITATION_KINDS,
  PROBLEM_STATUSES,
  type BetaInvitationKind,
  type ProblemStatus,
  COUPON_KINDS,
  INVOICE_NUMBER_PATTERN,
  OTP_CODE_PATTERN,
  STAFF_LIMITS,
  SHIPPING_LIMITS,
  SHOP_LIMITS,
  VENDOR_PRODUCT_LIMITS,
} from "@kemdia/contracts/constants";
import {
  BillingSettingsRequestSchema,
  CouponCreateRequestSchema,
  type AdminAccount,
  type DeliveryTariffsRequest,
  type SupportAccount,
} from "@kemdia/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, expiredCookieOptions } from "@/lib/auth/cookies";
import { forgetSession } from "@/lib/auth/session";
import type { StaffFailure } from "./api-staff";
import { staffErrorMessage, type StaffNotice } from "./messages";
import { qrDrawing, type QrDrawing } from "./qr";
import { staffPath } from "./roles";
import { sessionToken, staffApi } from "./staff";

/**
 * Actions serveur de l'espace de l'équipe (S6-T05, ADR-0036). Ce sont des points d'entrée PUBLICS : chaque argument
 * est revérifié ici (type, longueur, forme) et l'API refait toutes les règles (rôle, 2FA confirmée, statut, version
 * lue). Le jeton de session ne quitte jamais le serveur ; un secret ou des codes de secours ne sont renvoyés qu'au
 * navigateur qui vient de les demander, jamais mis dans une adresse ni dans un cookie.
 */

export type StaffActionFailure = { ok: false; message: string; signedOut?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Code à 6 chiffres, ou code de secours « abcd-efgh-jkmn » (l'API tolère majuscules et espaces). */
const CODE_INPUT = /^[A-Za-z0-9 -]{6,20}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length <= max ? value : null;
const field = (form: FormData, name: string, max: number) => text(form.get(name), max);

/** Session refusée, ou fermée par l'API après trop de codes faux : on oublie le cookie de ce navigateur. */
async function dropSession(token: string): Promise<void> {
  forgetSession(token);
  (await cookies()).set(SESSION_COOKIE, "", expiredCookieOptions());
}

async function failure(token: string, result: StaffFailure): Promise<StaffActionFailure> {
  const signedOut = result.code === "SESSION_INVALIDE" || result.code === "TROP_D_ESSAIS";
  if (signedOut) await dropSession(token);
  return {
    ok: false,
    message: staffErrorMessage(result.code, result.retryAfterSeconds),
    ...(signedOut ? { signedOut: true } : {}),
  };
}

const signedOutFailure: StaffActionFailure = {
  ok: false,
  message: staffErrorMessage("SESSION_INVALIDE"),
  signedOut: true,
};

// --- Double authentification (S6-T03) ---

export type SetupResult =
  { ok: true; secret: string; otpauthUri: string; qr: QrDrawing } | StaffActionFailure;

/** Nouveau secret contre le mot de passe : le QR code est dessiné ici, sur le serveur. */
export async function setupSecondFactorAction(password: unknown): Promise<SetupResult> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const pw = text(password, 200);
  if (!pw) return { ok: false, message: staffErrorMessage("MOT_DE_PASSE_INCORRECT") };
  const result = await staffApi().setupSecondFactor(token, pw);
  if (!result.ok) return failure(token, result);
  const { secret, otpauthUri } = result.data;
  return { ok: true, secret, otpauthUri, qr: qrDrawing(otpauthUri) };
}

export type CodesResult = { ok: true; recoveryCodes: string[] } | StaffActionFailure;

/** Premier code : active la 2FA ; les 10 codes de secours ne sont montrés qu'ici, une fois. */
export async function enableSecondFactorAction(code: unknown): Promise<CodesResult> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const value = text(code, 20)?.trim();
  if (!value || !OTP_CODE_PATTERN.test(value))
    return { ok: false, message: "Saisissez le code à 6 chiffres affiché dans votre application." };
  const result = await staffApi().enableSecondFactor(token, value);
  if (!result.ok) return failure(token, result);
  return { ok: true, recoveryCodes: [...result.data.recoveryCodes] };
}

/** Confirme cette session pour 15 minutes, puis revient à la page de l'équipe demandée. */
export async function verifySecondFactorAction(
  code: unknown,
  returnTo: unknown,
): Promise<StaffActionFailure> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const value = text(code, 30)?.trim();
  if (!value || !CODE_INPUT.test(value))
    return {
      ok: false,
      message: "Saisissez le code à 6 chiffres de votre application, ou un code de secours.",
    };
  const result = await staffApi().verifySecondFactor(token, value);
  if (!result.ok) return failure(token, result);
  // Hors du bloc ci-dessus : `redirect` interrompt l'action (jamais attrapé)
  redirect(staffPath(returnTo));
}

/** Nouveaux codes de secours, contre un code FRAIS de l'application (pas un code de secours). */
export async function regenerateRecoveryCodesAction(code: unknown): Promise<CodesResult> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const value = text(code, 20)?.trim();
  if (!value || !OTP_CODE_PATTERN.test(value))
    return { ok: false, message: "Saisissez le code à 6 chiffres affiché dans votre application." };
  const result = await staffApi().regenerateRecoveryCodes(token, value);
  if (!result.ok) return failure(token, result);
  return { ok: true, recoveryCodes: [...result.data.recoveryCodes] };
}

// --- Décisions (formulaires simples : fonctionnent même sans JavaScript) ---

/**
 * Après une décision refusée par l'API : 2FA à confirmer → saisie du code puis retour ; session perdue → connexion ;
 * sinon, la page de départ avec le code d'erreur (liste fermée, relue par la page).
 */
async function afterFailure(token: string, result: StaffFailure, page: string): Promise<never> {
  if (result.code === "DEUX_FACTEURS_REQUIS")
    redirect(`/equipe/confirmer?retour=${encodeURIComponent(page)}`);
  if (result.code === "DEUX_FACTEURS_A_ACTIVER") redirect("/equipe/securite");
  if (result.code === "SESSION_INVALIDE") {
    await dropSession(token);
    redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  }
  redirect(`${page}?erreur=${result.code}`);
}

const SHOP_DECISIONS = ["approve", "reject", "suspend"] as const;
const SHOP_NOTICES: Record<(typeof SHOP_DECISIONS)[number], StaffNotice> = {
  approve: "boutique-validee",
  reject: "boutique-refusee",
  suspend: "boutique-suspendue",
};

/** Valider, refuser ou suspendre une boutique (administrateurs). */
export async function decideShopAction(form: FormData): Promise<never> {
  const shopId = field(form, "shopId", 36);
  const decision = SHOP_DECISIONS.find((d) => d === form.get("decision"));
  if (!shopId || !UUID.test(shopId) || !decision) redirect("/equipe/boutiques");
  const page = `/equipe/boutiques/${shopId.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  let reason: string | undefined;
  if (decision !== "approve") {
    reason = field(form, "reason", SHOP_LIMITS.reasonMax * 2)?.trim();
    if (!reason || reason.length < SHOP_LIMITS.reasonMin || reason.length > SHOP_LIMITS.reasonMax)
      redirect(`${page}?erreur=BOUTIQUE_INVALIDE`);
  }
  const result = await staffApi().decideShop(token, shopId, decision, reason);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=${SHOP_NOTICES[decision]}`);
}

const PRODUCT_DECISIONS = ["approve", "reject"] as const;

/** Valider ou refuser la version d'un produit LUE par le modérateur (`submittedAt`). */
export async function decideProductAction(form: FormData): Promise<never> {
  const productId = field(form, "productId", 36);
  const decision = PRODUCT_DECISIONS.find((d) => d === form.get("decision"));
  const submittedAt = field(form, "submittedAt", 40);
  if (
    !productId ||
    !UUID.test(productId) ||
    !decision ||
    !submittedAt ||
    !ISO_DATE.test(submittedAt)
  )
    redirect("/equipe/moderation");
  const page = `/equipe/moderation/${productId.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  let reason: string | undefined;
  if (decision === "reject") {
    reason = field(form, "reason", VENDOR_PRODUCT_LIMITS.reasonMax * 2)?.trim();
    const L = VENDOR_PRODUCT_LIMITS;
    if (!reason || reason.length < L.reasonMin || reason.length > L.reasonMax)
      redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  }
  const result = await staffApi().decideProduct(token, productId, decision, submittedAt, reason);
  if (!result.ok) return afterFailure(token, result, page);
  // Retour à la file : le produit suivant attend
  redirect(`/equipe/moderation?ok=${decision === "approve" ? "produit-valide" : "produit-refuse"}`);
}

const KYC_DECISIONS = ["approve", "reject"] as const;

/** Valider ou refuser le dossier de vérification d'un vendeur (administrateurs, S6-T08). */
export async function decideKycAction(form: FormData): Promise<never> {
  const shopId = field(form, "shopId", 36);
  const decision = KYC_DECISIONS.find((d) => d === form.get("decision"));
  if (!shopId || !UUID.test(shopId) || !decision) redirect("/equipe/verifications");
  const page = `/equipe/verifications/${shopId.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  let reason: string | undefined;
  if (decision === "reject") {
    reason = field(form, "reason", SHOP_LIMITS.reasonMax * 2)?.trim();
    const length = reason ? [...reason].length : 0;
    if (!reason || length < SHOP_LIMITS.reasonMin || length > SHOP_LIMITS.reasonMax)
      redirect(`${page}?erreur=KYC_INVALIDE`);
  }
  const result = await staffApi().decideKyc(token, shopId, decision, reason);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=${decision === "approve" ? "kyc-valide" : "kyc-refuse"}`);
}

// --- Livraisons (S7-T02, administrateurs) ---

const ORDER_REFERENCE = /^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const SHIPMENT_STEPS = ["hand-over", "delivered", "failed", "retry", "cancel"] as const;
const STEP_NOTICES: Record<(typeof SHIPMENT_STEPS)[number], StaffNotice> = {
  "hand-over": "livraison-remise",
  delivered: "livraison-livree",
  failed: "livraison-echec",
  retry: "livraison-relancee",
  cancel: "livraison-annulee",
};

/**
 * Étape d'une livraison. La remise au transporteur part de la liste « Prêtes » (on y revient) ; les autres étapes, de
 * la fiche de l'expédition. Motif (échec) et note (annulation) : 3 à 200 caractères, revérifiés par l'API.
 */
export async function shipmentStepAction(form: FormData): Promise<never> {
  const reference = field(form, "reference", 10);
  const step = SHIPMENT_STEPS.find((s) => s === form.get("step"));
  if (!reference || !ORDER_REFERENCE.test(reference) || !step) redirect("/equipe/livraisons");
  const page = step === "hand-over" ? "/equipe/livraisons" : `/equipe/livraisons/${reference}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  let text: string | undefined;
  if (step === "failed" || step === "cancel") {
    text = field(form, "reason", SHIPPING_LIMITS.reasonMax * 2)?.trim();
    const length = text ? [...text].length : 0;
    if (!text || length < SHIPPING_LIMITS.reasonMin || length > SHIPPING_LIMITS.reasonMax)
      redirect(`${page}?erreur=EXPEDITION_INVALIDE`);
  }
  const result = await staffApi().shipmentStep(token, reference, step, text);
  if (!result.ok) return afterFailure(token, result, page);
  // Après la remise, on reste sur la liste des commandes prêtes (plusieurs colis à la suite)
  redirect(`${page}?ok=${STEP_NOTICES[step]}`);
}

const ZONE_IDS = ["zone_1", "zone_2", "zone_3", "zone_4"] as const;

/** Nombre entier saisi dans le formulaire (espaces de milliers tolérés), dans les bornes ; sinon `null`. */
function integer(form: FormData, name: string, max: number): number | null {
  const raw = field(form, name, 20)?.replace(/[\s\u202f\u00a0]/g, "");
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= max ? value : null;
}

/** Barème des 4 zones (administrateurs) ; l'API revérifie tout et inscrit le changement au journal d'audit. */
export async function updateTariffsAction(form: FormData): Promise<never> {
  const page = "/equipe/livraisons/bareme";
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  const zones: DeliveryTariffsRequest["zones"] = [];
  for (const id of ZONE_IDS) {
    const baseFee = integer(form, `${id}.baseFee`, SHIPPING_LIMITS.baseFeeMax);
    const freeThreshold = integer(form, `${id}.freeThreshold`, SHIPPING_LIMITS.freeThresholdMax);
    const daysMin = integer(form, `${id}.daysMin`, SHIPPING_LIMITS.daysMax);
    const daysMax = integer(form, `${id}.daysMax`, SHIPPING_LIMITS.daysMax);
    if (
      baseFee === null ||
      freeThreshold === null ||
      daysMin === null ||
      daysMax === null ||
      daysMin > daysMax
    )
      redirect(`${page}?erreur=TARIFS_INVALIDES`);
    zones.push({ id, baseFee, freeThreshold, daysMin, daysMax });
  }
  const result = await staffApi().updateTariffs(token, { zones });
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=bareme-enregistre`);
}

// --- Fiches communes (S7.5-T03) ---

/** Page d'une fiche, après vérification de son identifiant ; le jeton de session ou la page de connexion. */
async function listingPage(form: FormData): Promise<{ token: string; id: string; page: string }> {
  const id = field(form, "listingId", 36);
  if (!id || !UUID.test(id)) redirect("/equipe/fiches");
  const page = `/equipe/fiches/${id.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  return { token, id: id.toLowerCase(), page };
}

/**
 * Correction de la fiche : titre, description, marque, catégorie, noms des déclinaisons (et une nouvelle déclinaison).
 * Seuls les champs remplis partent ; l'API vérifie tout (mêmes règles que la fiche d'un vendeur).
 */
export async function updateListingAction(form: FormData): Promise<never> {
  const { token, id, page } = await listingPage(form);
  const L = VENDOR_PRODUCT_LIMITS;
  const title = field(form, "title", L.titleMax * 2)?.trim();
  const description = field(form, "description", L.descriptionMax * 2)?.trim();
  const brand = field(form, "brand", L.brandMax * 2)?.trim();
  const categoryId = field(form, "categoryId", 36);
  const variants: { id?: string; name: string }[] = [];
  for (const variantId of form.getAll("variantIds").slice(0, 50)) {
    if (typeof variantId !== "string" || !UUID.test(variantId)) continue;
    const name = field(form, `variant-${variantId}`, L.variantNameMax * 2)?.trim();
    const before = field(form, `variant-before-${variantId}`, L.variantNameMax * 2);
    if (name && name !== before) variants.push({ id: variantId.toLowerCase(), name });
  }
  const added = field(form, "newVariant", L.variantNameMax * 2)?.trim();
  if (added) variants.push({ name: added });
  if (categoryId && !UUID.test(categoryId)) redirect(`${page}?erreur=CATEGORIE_INCONNUE`);
  const result = await staffApi().updateListing(token, id, {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    // Marque vide : « sans marque »
    ...(brand !== undefined && form.has("brand") ? { brand: brand || null } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(variants.length ? { variants } : {}),
  });
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=fiche-corrigee`);
}

export async function removeListingImageAction(form: FormData): Promise<never> {
  const { token, id, page } = await listingPage(form);
  const imageId = field(form, "imageId", 36);
  if (!imageId || !UUID.test(imageId)) redirect(`${page}?erreur=PHOTO_INTROUVABLE`);
  const result = await staffApi().removeListingImage(token, id, imageId);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=photo-fiche-retiree`);
}

/**
 * Fusion d'un doublon dans une fiche en ligne : en deux temps (la fiche cible est choisie, puis chaque déclinaison
 * vendue du doublon reçoit sa déclinaison cible). Retour à la fiche CIBLE.
 */
export async function mergeListingAction(form: FormData): Promise<never> {
  const { token, id, page } = await listingPage(form);
  const into = field(form, "into", 36);
  if (!into || !UUID.test(into)) redirect(`${page}?erreur=FICHE_INTROUVABLE`);
  const variants: Record<string, string> = {};
  for (const from of form.getAll("sourceVariantIds").slice(0, 50)) {
    if (typeof from !== "string" || !UUID.test(from)) continue;
    const to = field(form, `map-${from}`, 36);
    if (to && UUID.test(to)) variants[from.toLowerCase()] = to.toLowerCase();
  }
  const result = await staffApi().mergeListing(token, id, into, variants);
  if (!result.ok) {
    if (
      ["DEUX_FACTEURS_REQUIS", "DEUX_FACTEURS_A_ACTIVER", "SESSION_INVALIDE"].includes(result.code)
    )
      return afterFailure(token, result, page);
    redirect(`${page}?fusion=${into.toLowerCase()}&erreur=${result.code}`);
  }
  redirect(`/equipe/fiches/${into.toLowerCase()}?ok=fiche-fusionnee`);
}

export async function withdrawOfferAction(form: FormData): Promise<never> {
  const { token, page } = await listingPage(form);
  const productId = field(form, "productId", 36);
  const reason = field(form, "reason", VENDOR_PRODUCT_LIMITS.reasonMax * 2)?.trim();
  const L = VENDOR_PRODUCT_LIMITS;
  if (!productId || !UUID.test(productId)) redirect(`${page}?erreur=PRODUIT_INTROUVABLE`);
  if (!reason || reason.length < L.reasonMin || reason.length > L.reasonMax)
    redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  const result = await staffApi().withdrawOffer(token, productId, reason);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=offre-retiree`);
}

/** Clôture d'une proposition de correction ; retour à la page d'où elle a été close (fiche ou liste). */
export async function closeCorrectionAction(form: FormData): Promise<never> {
  const correctionId = field(form, "correctionId", 36);
  const back = field(form, "back", 80);
  const page =
    back && /^\/equipe\/fiches(?:\/[0-9a-f-]{36})?$/.test(back) ? back : "/equipe/fiches";
  if (!correctionId || !UUID.test(correctionId)) redirect(page);
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  const note = field(form, "note", 600)?.trim() || undefined;
  if (note && [...note].length > 300) redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  const result = await staffApi().closeCorrection(token, correctionId, note);
  if (!result.ok) return afterFailure(token, result, page);
  redirect(`${page}?ok=correction-close`);
}

// --- Équipe (S7.5-T04, ADR-0051 ; administrateurs) ---

const USERS_PAGE = "/equipe/utilisateurs";

export type LookupResult<T> = { ok: true; account: T } | StaffActionFailure | null;

/** Identifiant saisi (e-mail ou mobile) : revérifié par l'API ; jamais mis dans une adresse. */
const identifierOf = (form: FormData) => field(form, "identifier", 300)?.trim() || null;

/** Retrouver un compte pour lui donner un rôle : le résultat n'est rendu qu'au navigateur qui l'a demandé. */
export async function lookupStaffAccountAction(
  _previous: LookupResult<AdminAccount>,
  form: FormData,
): Promise<LookupResult<AdminAccount>> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const identifier = identifierOf(form);
  if (!identifier) return { ok: false, message: staffErrorMessage("IDENTIFIANT_INVALIDE") };
  const result = await staffApi().lookupAccount(token, identifier);
  if (!result.ok) return failure(token, result);
  return { ok: true, account: result.data };
}

/** Accorder ou retirer UN rôle (jamais « admin » : liste fermée du contrat). */
export async function setStaffRoleAction(form: FormData): Promise<never> {
  const accountId = field(form, "accountId", 36);
  const role = ADMIN_ASSIGNABLE_ROLES.find((r) => r === form.get("role"));
  const grant = form.get("grant");
  if (!accountId || !UUID.test(accountId) || !role || (grant !== "1" && grant !== "0"))
    redirect(USERS_PAGE);
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(USERS_PAGE)}`);
  const result = await staffApi().setRole(token, accountId, role, grant === "1");
  if (!result.ok) return afterFailure(token, result, USERS_PAGE);
  redirect(`${USERS_PAGE}?ok=${grant === "1" ? "role-accorde" : "role-retire"}`);
}

const ACCOUNT_ACTIONS = ["remove-staff", "disable", "enable"] as const;
const ACCOUNT_NOTICES: Record<(typeof ACCOUNT_ACTIONS)[number], StaffNotice> = {
  "remove-staff": "equipe-retiree",
  disable: "compte-desactive",
  enable: "compte-reactive",
};

/**
 * Départ d'un employé, désactivation ou réactivation. « Retirer » et « Désactiver » exigent la case « Je confirme »
 * (choix du 2026-10-22) ; la désactivation exige aussi un motif, gardé au journal d'audit.
 */
export async function staffAccountAction(form: FormData): Promise<never> {
  const accountId = field(form, "accountId", 36);
  const action = ACCOUNT_ACTIONS.find((a) => a === form.get("action"));
  if (!accountId || !UUID.test(accountId) || !action) redirect(USERS_PAGE);
  if (action !== "enable" && form.get("confirme") !== "oui")
    redirect(`${USERS_PAGE}?erreur=CONFIRMATION_REQUISE`);
  let reason: string | undefined;
  if (action === "disable") {
    reason = field(form, "reason", STAFF_LIMITS.reasonMax * 2)
      ?.trim()
      .replace(/\s+/g, " ");
    const length = reason ? [...reason].length : 0;
    if (!reason || length < STAFF_LIMITS.reasonMin || length > STAFF_LIMITS.reasonMax)
      redirect(`${USERS_PAGE}?erreur=MOTIF_INVALIDE`);
  }
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(USERS_PAGE)}`);
  const result = await staffApi().staffAction(token, accountId, action, reason);
  if (!result.ok) return afterFailure(token, result, USERS_PAGE);
  redirect(`${USERS_PAGE}?ok=${ACCOUNT_NOTICES[action]}`);
}

// --- Service client (S7.5-T04 ; lecture seule) ---

/** Retrouver un client (recherche inscrite au journal d'audit par l'API). */
export async function supportLookupAction(
  _previous: LookupResult<SupportAccount>,
  form: FormData,
): Promise<LookupResult<SupportAccount>> {
  const token = await sessionToken();
  if (!token) return signedOutFailure;
  const identifier = identifierOf(form);
  if (!identifier) return { ok: false, message: staffErrorMessage("IDENTIFIANT_INVALIDE") };
  const result = await staffApi().supportLookup(token, identifier);
  if (!result.ok) return failure(token, result);
  return { ok: true, account: result.data };
}

// --- Finance (S7.5-T05, ADR-0052) ---

const INVOICES_PAGE = "/equipe/factures";
const CASH_PAGE = "/equipe/encaissements";
const REFUNDS_PAGE = "/equipe/remboursements";
const COUPONS_PAGE = "/equipe/codes-promo";
const SETTINGS_PAGE = "/equipe/reglages";

async function tokenFor(page: string): Promise<string> {
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  return token;
}

/** Renvoyer une facture au client (e-mail tout de suite ; refusé pendant l'envoi automatique). */
export async function resendInvoiceAction(form: FormData): Promise<never> {
  const number = field(form, "number", 20);
  if (!number || !INVOICE_NUMBER_PATTERN.test(number)) redirect(INVOICES_PAGE);
  const token = await tokenFor(INVOICES_PAGE);
  const result = await staffApi().resendInvoice(token, number);
  if (!result.ok) return afterFailure(token, result, INVOICES_PAGE);
  redirect(`${INVOICES_PAGE}?ok=facture-renvoyee`);
}

/** Espèces reçues : le montant saisi doit être le total (revérifié par l'API). */
export async function codCollectedAction(form: FormData): Promise<never> {
  const reference = field(form, "reference", 10);
  const amount = integer(form, "amount", 10_000_000);
  if (!reference || !ORDER_REFERENCE.test(reference)) redirect(CASH_PAGE);
  if (amount === null || amount <= 0) redirect(`${CASH_PAGE}?erreur=ENCAISSEMENT_IMPOSSIBLE`);
  const token = await tokenFor(CASH_PAGE);
  const result = await staffApi().codCollected(token, reference, amount);
  if (!result.ok) return afterFailure(token, result, CASH_PAGE);
  redirect(`${CASH_PAGE}?ok=especes-encaissees`);
}

const EXTERNAL_REFERENCE = /^[A-Za-z0-9._/-]{3,100}$/;

/** Remboursement fait chez l'opérateur, avec la référence de l'opération. */
export async function refundDoneAction(form: FormData): Promise<never> {
  const refundId = field(form, "refundId", 36);
  const reference = field(form, "externalReference", 100)?.trim();
  if (!refundId || !UUID.test(refundId)) redirect(REFUNDS_PAGE);
  if (!reference || !EXTERNAL_REFERENCE.test(reference))
    redirect(`${REFUNDS_PAGE}?erreur=REFERENCE_INVALIDE`);
  const token = await tokenFor(REFUNDS_PAGE);
  const result = await staffApi().refundDone(token, refundId, reference);
  if (!result.ok) return afterFailure(token, result, REFUNDS_PAGE);
  redirect(`${REFUNDS_PAGE}?ok=remboursement-fait`);
}

/** Date saisie dans un champ « date » (AAAA-MM-JJ), à minuit heure de Libreville (UTC+1) ; vide → `null`. */
function dateField(form: FormData, name: string, endOfDay = false): string | null | undefined {
  const raw = field(form, name, 10)?.trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const at = new Date(`${raw}T${endOfDay ? "23:59:59.000" : "00:00:00.000"}+01:00`);
  if (Number.isNaN(at.getTime())) return undefined;
  // Date impossible (31 février…) : JavaScript la reporte au mois suivant ; on la refuse (relecture)
  const local = new Date(at.getTime() + 60 * 60_000).toISOString().slice(0, 10);
  return local === raw ? at.toISOString() : undefined;
}

/** Nombre facultatif : vide → `null`, sinon entier dans les bornes (`undefined` : refusé). */
function optionalInteger(form: FormData, name: string, max: number): number | null | undefined {
  const raw = field(form, name, 20)?.trim();
  if (!raw) return null;
  return integer(form, name, max) ?? undefined;
}

/** Nouveau code promo : chaque champ revérifié ici (schéma du contrat), puis par l'API (règles BR-031). */
export async function createCouponAction(form: FormData): Promise<never> {
  const token = await tokenFor(COUPONS_PAGE);
  const kind = COUPON_KINDS.find((k) => k === form.get("kind"));
  const startsAt = dateField(form, "startsAt");
  const endsAt = dateField(form, "endsAt", true);
  // Date mal formée ou impossible : refusée (sinon le champ serait simplement omis)
  if (startsAt === undefined || endsAt === undefined)
    redirect(`${COUPONS_PAGE}?erreur=COUPON_INVALIDE`);
  const candidate = {
    code: field(form, "code", 40)?.trim().toUpperCase(),
    kind,
    value: integer(form, "value", 10_000_000),
    maxDiscount: optionalInteger(form, "maxDiscount", 10_000_000),
    minSubtotal: optionalInteger(form, "minSubtotal", 100_000_000),
    startsAt,
    endsAt,
    usageLimit: optionalInteger(form, "usageLimit", 1_000_000),
    perAccountLimit: optionalInteger(form, "perAccountLimit", 1_000_000),
    stackableWithSales: form.get("stackableWithSales") === "oui",
  };
  const parsed = CouponCreateRequestSchema.safeParse(candidate);
  if (!parsed.success) redirect(`${COUPONS_PAGE}?erreur=COUPON_INVALIDE`);
  const result = await staffApi().createCoupon(token, parsed.data);
  if (!result.ok) return afterFailure(token, result, COUPONS_PAGE);
  redirect(`${COUPONS_PAGE}?ok=code-cree`);
}

export async function setCouponActiveAction(form: FormData): Promise<never> {
  const couponId = field(form, "couponId", 36);
  const active = form.get("active");
  if (!couponId || !UUID.test(couponId) || (active !== "1" && active !== "0"))
    redirect(COUPONS_PAGE);
  const token = await tokenFor(COUPONS_PAGE);
  const result = await staffApi().setCouponActive(token, couponId, active === "1");
  if (!result.ok) return afterFailure(token, result, COUPONS_PAGE);
  redirect(`${COUPONS_PAGE}?ok=${active === "1" ? "code-active" : "code-desactive"}`);
}

const BILLING_FIELDS = [
  "legalName",
  "address",
  "city",
  "phone",
  "email",
  "taxId",
  "tradeRegister",
  "vatMention",
] as const;

/** Coordonnées de l'entreprise imprimées sur les NOUVELLES factures (une facture émise ne change jamais). */
export async function saveBillingSettingsAction(form: FormData): Promise<never> {
  const token = await tokenFor(SETTINGS_PAGE);
  const candidate = Object.fromEntries(
    BILLING_FIELDS.map((name) => [name, field(form, name, 240)?.trim() ?? ""]),
  );
  const parsed = BillingSettingsRequestSchema.safeParse(candidate);
  if (!parsed.success) redirect(`${SETTINGS_PAGE}?erreur=REGLAGES_INVALIDES`);
  const result = await staffApi().saveBillingSettings(token, parsed.data);
  if (!result.ok) return afterFailure(token, result, SETTINGS_PAGE);
  redirect(`${SETTINGS_PAGE}?ok=facturation-enregistree`);
}

const COD_ZONES = ["zone_1", "zone_2", "zone_3", "zone_4"] as const;

/** Paiement à la livraison : zones où il est proposé et total maximum. */
export async function saveCodSettingsAction(form: FormData): Promise<never> {
  const token = await tokenFor(SETTINGS_PAGE);
  const zones = COD_ZONES.filter((zone) => form.getAll("zones").includes(zone));
  const maxTotal = integer(form, "maxTotal", 10_000_000);
  if (maxTotal === null) redirect(`${SETTINGS_PAGE}?erreur=REGLAGES_INVALIDES`);
  const result = await staffApi().saveCodSettings(token, { zones, maxTotal });
  if (!result.ok) return afterFailure(token, result, SETTINGS_PAGE);
  redirect(`${SETTINGS_PAGE}?ok=livraison-enregistree`);
}

// --- Avis des clients (S8-T01, ADR-0056 ; équipe Catalogue) ---

const REVIEWS_PAGE = "/equipe/avis";
// Champ caché « version » : date ISO de l'avis lu, pour que l'équipe décide sur le texte qu'elle a vu

/** Publier un avis en attente. */
export async function publishReviewAction(form: FormData): Promise<never> {
  const reviewId = field(form, "reviewId", 36);
  const version = field(form, "version", 30);
  if (!reviewId || !UUID.test(reviewId) || !version || !ISO_DATE.test(version))
    redirect(REVIEWS_PAGE);
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(REVIEWS_PAGE)}`);
  const result = await staffApi().decideReview(token, reviewId, "publish", version);
  if (!result.ok) return afterFailure(token, result, REVIEWS_PAGE);
  redirect(`${REVIEWS_PAGE}?ok=avis-publie`);
}

/** Refuser un avis en attente, avec un motif montré à l'auteur (5 à 300 caractères, revérifié par l'API). */
export async function rejectReviewAction(form: FormData): Promise<never> {
  const reviewId = field(form, "reviewId", 36);
  const version = field(form, "version", 30);
  if (!reviewId || !UUID.test(reviewId) || !version || !ISO_DATE.test(version))
    redirect(REVIEWS_PAGE);
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(REVIEWS_PAGE)}`);
  const reason = field(form, "reason", 600)?.trim() ?? "";
  const length = [...reason].length;
  if (length < 5 || length > 300) redirect(`${REVIEWS_PAGE}?erreur=AVIS_INVALIDE`);
  const result = await staffApi().decideReview(token, reviewId, "reject", version, reason);
  if (!result.ok) return afterFailure(token, result, REVIEWS_PAGE);
  redirect(`${REVIEWS_PAGE}?ok=avis-refuse`);
}

// --- Bêta fermée (S8-T02, ADR-0057 ; administrateurs) ---

const BETA_PAGE = "/equipe/beta";

/** Ouvrir l'inscription à tous, ou la réserver aux adresses invitées. */
export async function setBetaClosedAction(form: FormData): Promise<never> {
  const closed = field(form, "closed", 5);
  if (closed !== "true" && closed !== "false") redirect(BETA_PAGE);
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(BETA_PAGE)}`);
  const result = await staffApi().setBetaClosed(token, closed === "true");
  if (!result.ok) return afterFailure(token, result, BETA_PAGE);
  redirect(`${BETA_PAGE}?ok=${result.data.closed ? "beta-fermee" : "beta-ouverte"}`);
}

/** Inviter une adresse e-mail ou un mobile (revérifiés et normalisés par l'API). */
export async function inviteToBetaAction(form: FormData): Promise<never> {
  const identifier = field(form, "identifier", 300)?.trim() ?? "";
  const kind = field(form, "kind", 20);
  if (
    identifier.length < 3 ||
    !kind ||
    !(BETA_INVITATION_KINDS as readonly string[]).includes(kind)
  )
    redirect(`${BETA_PAGE}?erreur=IDENTIFIANT_INVALIDE`);
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(BETA_PAGE)}`);
  const result = await staffApi().inviteToBeta(token, identifier, kind as BetaInvitationKind);
  if (!result.ok) return afterFailure(token, result, BETA_PAGE);
  redirect(
    `${BETA_PAGE}?ok=${result.data.notified ? "invitation-envoyee" : "invitation-a-prevenir"}`,
  );
}

/** Annuler une invitation pas encore utilisée. */
export async function revokeBetaInvitationAction(form: FormData): Promise<never> {
  const invitationId = field(form, "invitationId", 36);
  if (!invitationId || !UUID.test(invitationId)) redirect(BETA_PAGE);
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(BETA_PAGE)}`);
  const result = await staffApi().revokeBetaInvitation(token, invitationId);
  if (!result.ok) return afterFailure(token, result, BETA_PAGE);
  redirect(`${BETA_PAGE}?ok=invitation-annulee`);
}

// --- Signalements (S8-T02 ; service client) ---

const PROBLEMS_PAGE = "/equipe/signalements";
const PROBLEM_NOTICES: Record<ProblemStatus, StaffNotice> = {
  new: "signalement-rouvert",
  in_progress: "signalement-en-cours",
  resolved: "signalement-resolu",
};

/** Faire avancer un signalement ; refusé par l'API si un collègue l'a changé depuis la lecture (`version`). */
export async function setProblemStatusAction(form: FormData): Promise<never> {
  const problemId = field(form, "problemId", 36);
  const status = field(form, "status", 20);
  const version = field(form, "version", 30);
  if (
    !problemId ||
    !UUID.test(problemId) ||
    !status ||
    !(PROBLEM_STATUSES as readonly string[]).includes(status) ||
    !version ||
    !ISO_DATE.test(version)
  )
    redirect(PROBLEMS_PAGE);
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(PROBLEMS_PAGE)}`);
  const to = status as ProblemStatus;
  const result = await staffApi().setProblemStatus(token, problemId, to, version);
  if (!result.ok) return afterFailure(token, result, PROBLEMS_PAGE);
  redirect(`${PROBLEMS_PAGE}?ok=${PROBLEM_NOTICES[to]}`);
}
