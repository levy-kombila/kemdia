import {
  PROBLEM_CATEGORIES,
  PROBLEM_LIMITS,
  type ProblemCategory,
} from "@kemdia/contracts/constants";
import type { FeedbackFailureCode } from "./api-feedback";

export const FEEDBACK_MESSAGES: Record<FeedbackFailureCode, string> = {
  SIGNALEMENT_INVALIDE: `Décrivez le problème en ${PROBLEM_LIMITS.messageMin} à ${PROBLEM_LIMITS.messageMax} caractères.`,
  TROP_DE_SIGNALEMENTS:
    "Vous avez déjà plusieurs signalements en attente : l'équipe les traite, merci de patienter.",
  SIGNALEMENT_INTROUVABLE: "Signalement introuvable.",
  SIGNALEMENT_MODIFIE: "Ce signalement vient d'être modifié.",
  SESSION_INVALIDE: "Votre session a expiré. Reconnectez-vous pour signaler un problème.",
  TROP_DE_REQUETES: "Trop d'envois rapprochés. Patientez une minute avant de réessayer.",
  INDISPONIBLE: "Service momentanément indisponible. Réessayez dans quelques instants.",
};

/**
 * Page d'où vient le visiteur (`?depuis=`) : un chemin du site seulement, sans paramètres ni ancre (ils peuvent
 * contenir un jeton) ; « //autre-site », barre oblique inverse et caractères de contrôle refusés.
 */
export function pageFrom(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split(/[?#]/, 1)[0] ?? "";
  return /^\/(?!\/)[^\s\\\u0000-\u001f\u007f-\u009f]{0,199}$/.test(path) ? path : null;
}

export type CheckedProblem =
  { ok: true; category: ProblemCategory; message: string } | { ok: false; message: string };

/** Mêmes règles que l'API (revérifiées par elle) : genre connu, description de 10 à 2 000 caractères. */
export function checkProblem(category: unknown, message: unknown): CheckedProblem {
  if (typeof category !== "string" || !(PROBLEM_CATEGORIES as readonly string[]).includes(category))
    return { ok: false, message: "Choisissez le genre de problème." };
  const text = typeof message === "string" ? message.trim() : "";
  const length = [...text].length;
  if (length < PROBLEM_LIMITS.messageMin || length > PROBLEM_LIMITS.messageMax)
    return { ok: false, message: FEEDBACK_MESSAGES.SIGNALEMENT_INVALIDE };
  return { ok: true, category: category as ProblemCategory, message: text };
}
