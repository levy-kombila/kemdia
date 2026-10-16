"use server";

import { OTP_CODE_PATTERN, SHOP_LIMITS, VENDOR_PRODUCT_LIMITS } from "@kemdia/contracts/constants";
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
