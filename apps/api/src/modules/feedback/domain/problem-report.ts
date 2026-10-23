import { FeedbackError } from "./feedback-error.js";

/**
 * « Signaler un problème » pendant la bêta (S8-T02, ADR-0057) : un compte connecté décrit ce qui ne va pas ; le
 * service client suit le signalement (nouveau → en cours → résolu, et réouverture possible).
 */

export const PROBLEM_CATEGORIES = ["bug", "display", "payment", "delivery", "other"] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];
export const PROBLEM_STATUSES = ["new", "in_progress", "resolved"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

/** Mêmes valeurs que PROBLEM_LIMITS du contrat (doublées par des contraintes SQL). */
export const PROBLEM_RULES = {
  messageMin: 10,
  messageMax: 2000,
  pageMax: 200,
  openPerAccount: 20,
  resolvedRetentionDays: 180,
} as const;

export interface ProblemReport {
  id: string;
  accountId: string;
  category: ProblemCategory;
  message: string;
  /** Chemin de la page du site (sans paramètres), ou `null` */
  page: string | null;
  /** Navigateur et système, choisis dans des listes fixes (« Chrome sur Android ») */
  device: string | null;
  status: ProblemStatus;
  handledBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Caractères de contrôle (sauf retour à la ligne et tabulation) et inversions du sens d'écriture (texte trompeur
 * pour le service client) : refusés dans la description.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
// eslint-disable-next-line no-control-regex
const PAGE = /^\/(?!\/)[^?#\s\u0000-\u001f\u007f-\u009f\\]{0,199}$/;

/**
 * Page concernée : un chemin du site seulement. Paramètres et ancre sont retirés (ils peuvent contenir un jeton ou
 * une adresse e-mail) ; « //autre-site » ou une barre oblique inverse (adresses d'un autre site pour un navigateur)
 * et toute valeur qui n'est pas un chemin sont ignorées plutôt que refusées.
 */
export function normalizePage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const path = raw.split(/[?#]/, 1)[0]?.trim() ?? "";
  return PAGE.test(path) ? path : null;
}

export function newProblemReport(input: {
  id: string;
  accountId: string;
  category: ProblemCategory;
  message: string;
  page?: string | null | undefined;
  device: string | null;
  now: Date;
}): ProblemReport {
  const message = input.message.trim();
  const length = [...message].length;
  if (length < PROBLEM_RULES.messageMin || length > PROBLEM_RULES.messageMax) {
    throw new FeedbackError(
      "SIGNALEMENT_INVALIDE",
      `décrivez le problème en ${PROBLEM_RULES.messageMin} à ${PROBLEM_RULES.messageMax} caractères`,
    );
  }
  if (CONTROL.test(message)) {
    throw new FeedbackError(
      "SIGNALEMENT_INVALIDE",
      "la description contient des caractères interdits",
    );
  }
  return {
    id: input.id,
    accountId: input.accountId,
    category: input.category,
    message,
    page: normalizePage(input.page),
    device: input.device,
    status: "new",
    handledBy: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Nouvel état décidé par le service client ; le même état ne change rien. */
export function changeStatus(
  report: ProblemReport,
  to: ProblemStatus,
  staffId: string,
  now: Date,
): ProblemReport {
  if (report.status === to) return report;
  return { ...report, status: to, handledBy: staffId, updatedAt: now };
}
