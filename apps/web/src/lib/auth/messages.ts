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
    "Mot de passe refusé : 8 caractères au moins, et pas un mot de passe courant.",
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
  // Administration (S4-T06) : pas encore d'écran sur le site, messages prêts pour le S6
  ACCES_REFUSE: "Cette action n'est pas permise avec votre compte.",
  RECONNEXION_REQUISE: "Par sécurité, reconnectez-vous pour faire cette action.",
  ROLE_NON_ATTRIBUABLE: "Ce rôle ne peut pas être accordé ici.",
  ROLE_SUR_SOI_INTERDIT: "Vous ne pouvez pas modifier vos propres rôles.",
  COMPTE_INTROUVABLE: "Aucun compte ne correspond.",
  COMPTE_INACTIF: "Ce compte n'est pas actif.",
  // Équipe et appareils (S7.5-T04)
  COMPTE_PROTEGE: "Un compte administrateur ne se gère que depuis le serveur.",
  MOTIF_INVALIDE: "Motif refusé : écrivez une raison claire (quelques mots au moins).",
  ALERTE_INVALIDE:
    "Ce lien n'est plus valable (déjà utilisé ou plus vieux de 7 jours). Changez votre mot de passe par prudence.",
  TROP_DE_REQUETES: "Trop de demandes. Patientez un instant avant de réessayer.",
  // Photo de profil (S7.5-T08)
  PHOTO_INVALIDE:
    "Photo refusée : JPEG, PNG ou WebP de 5 Mo au plus, 200 pixels au moins de chaque côté.",
  PHOTO_ABSENTE: "Vous n'avez pas encore de photo de profil.",
  // Bêta fermée (S8-T02)
  INVITATION_REQUISE:
    "Kemdia est en bêta fermée : seules les adresses invitées peuvent créer un compte. Utilisez l'adresse qui a reçu l'invitation (valable 30 jours).",
  INVITATION_INTROUVABLE: "Invitation introuvable.",
  INVITATION_UTILISEE: "Cette invitation a déjà servi : le compte existe, elle ne s'annule plus.",
  COMPTE_EXISTANT: "Cette adresse a déjà un compte Kemdia : inutile de l'inviter.",
  // Double authentification de l'équipe (S6-T03) : écrans plus tard au S6, messages prêts
  MOT_DE_PASSE_INCORRECT: "Mot de passe incorrect.",
  DEUX_FACTEURS_INDISPONIBLE:
    "La double authentification n'est pas disponible pour le moment. Contactez l'administrateur.",
  DEUX_FACTEURS_A_CONFIGURER: "Commencez par afficher le QR code de la double authentification.",
  DEUX_FACTEURS_DEJA_ACTIVE: "La double authentification est déjà activée sur ce compte.",
  DEUX_FACTEURS_A_ACTIVER: "Activez la double authentification de votre compte pour continuer.",
  DEUX_FACTEURS_REQUIS: "Par sécurité, saisissez le code de votre application d'authentification.",
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
