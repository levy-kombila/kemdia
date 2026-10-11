import type { SandboxFailureCode } from "./api-sandbox";

/** Messages du téléphone simulé, en français simple. */
const MESSAGES: Record<SandboxFailureCode, string> = {
  DEMANDE_INTROUVABLE: "Cette demande n'est plus en attente (déjà répondue ou expirée).",
  CODE_PIN_INVALIDE:
    "Saisissez un code PIN de 4 chiffres (n'importe lequel : c'est une simulation).",
  PAIEMENT_INDISPONIBLE:
    "L'opérateur simulé n'a pas pu prévenir Kemdia. Réessayez dans un instant.",
  SESSION_INVALIDE: "Votre session a expiré : reconnectez-vous.",
  TROP_DE_REQUETES: "Trop de demandes d'un coup : patientez une minute.",
  BAC_A_SABLE_FERME: "Le téléphone simulé n'existe pas sur cet environnement.",
  INDISPONIBLE: "Le service ne répond pas pour le moment. Réessayez dans un instant.",
};

export function sandboxMessage(code: SandboxFailureCode): string {
  return MESSAGES[code];
}
