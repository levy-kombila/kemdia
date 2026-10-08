import type { AuthErrorCode, AuthFailure } from "./types";

/** Durée lisible : 900 → « 15 minutes », 45 → « 45 secondes ». */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconde${seconds > 1 ? "s" : ""}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

const MESSAGES: Record<AuthErrorCode, string> = {
  IDENTIFIANT_INVALIDE: "Saisissez une adresse e-mail valide.",
  NOM_INVALIDE: "Prénom et nom : 2 à 60 lettres (espaces, apostrophes et tirets permis).",
  MOT_DE_PASSE_FAIBLE:
    "Mot de passe refusé : 8 caractères au moins, avec une lettre et un chiffre, et pas un mot de passe courant.",
  CANAL_INDISPONIBLE:
    "L'envoi par SMS sera bientôt disponible. Utilisez votre adresse e-mail pour le moment.",
  ENVOI_TROP_RAPPROCHE: "Un code vient d'être envoyé. Patientez avant d'en demander un autre.",
  TROP_D_ENVOIS: "Trop de codes demandés. Réessayez plus tard.",
  CODE_INVALIDE: "Code incorrect. Vérifiez l'e-mail reçu et réessayez.",
  CODE_EXPIRE: "Ce code a expiré. Demandez un nouveau code.",
  TROP_D_ESSAIS: "Trop d'essais pour ce code. Demandez un nouveau code.",
  // Message neutre : identique que l'adresse ait un compte ou non (pas d'énumération)
  IDENTIFIANTS_INCORRECTS: "Identifiant ou mot de passe incorrect.",
  COMPTE_BLOQUE:
    "Trop d'essais. Réessayez plus tard, ou choisissez un nouveau mot de passe avec « Mot de passe oublié ».",
  COMPTE_DESACTIVE: "Ce compte est désactivé. Contactez le service client Kemdia.",
  SESSION_INVALIDE: "Votre session a expiré. Reconnectez-vous.",
  INDISPONIBLE: "Service momentanément indisponible. Réessayez dans quelques instants.",
};

/** Message en français pour une erreur, avec le délai d'attente quand l'API l'indique. */
export function authErrorMessage(failure: Pick<AuthFailure, "code" | "retryAfterSeconds">): string {
  const wait = failure.retryAfterSeconds;
  if (wait && failure.code === "COMPTE_BLOQUE")
    return `Trop d'essais. Réessayez dans ${formatWait(wait)}, ou choisissez un nouveau mot de passe avec « Mot de passe oublié ».`;
  if (wait && (failure.code === "ENVOI_TROP_RAPPROCHE" || failure.code === "TROP_D_ENVOIS"))
    return `${MESSAGES[failure.code].split(".")[0]}. Nouveau code possible dans ${formatWait(wait)}.`;
  return MESSAGES[failure.code];
}

/** Avis affiché sur la page de connexion après « déconnecter tous mes appareils » (?deconnecte=tous). */
export const LOGGED_OUT_EVERYWHERE = "Vous avez été déconnecté de tous vos appareils.";
