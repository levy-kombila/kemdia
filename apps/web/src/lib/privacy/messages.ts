import type { PrivacyFailureCode } from "./api-privacy";

/** Ce qui empêche la suppression, en mots simples (S7-T08). */
export const BLOCKER_LABELS: Record<string, string> = {
  COMMANDE_EN_COURS: "Une commande est encore en cours : attendez sa livraison ou son annulation.",
  REMBOURSEMENT_EN_ATTENTE: "Un remboursement doit encore vous être versé.",
  PAIEMENT_EN_ATTENTE:
    "Un paiement Mobile Money attend encore la réponse de l'opérateur : réessayez dans 24 heures.",
  BOUTIQUE_OUVERTE:
    "Votre boutique est ouverte, en attente ou suspendue : demandez d'abord sa fermeture au service client.",
  COMPTE_EQUIPE: "Compte de l'équipe Kemdia : un administrateur doit d'abord retirer vos rôles.",
};

/** Message affiché après un refus de suppression. */
export function deletionErrorMessage(code: PrivacyFailureCode, retryAfterSeconds?: number): string {
  if (code in BLOCKER_LABELS) return BLOCKER_LABELS[code]!;
  switch (code) {
    case "MOT_DE_PASSE_INCORRECT":
      return "Mot de passe incorrect.";
    case "COMPTE_BLOQUE":
    case "TROP_DE_REQUETES": {
      const minutes = retryAfterSeconds ? Math.ceil(retryAfterSeconds / 60) : 15;
      return `Trop d'essais : réessayez dans ${minutes} min.`;
    }
    case "SESSION_INVALIDE":
      return "Votre session a expiré : reconnectez-vous.";
    default:
      return "Le service ne répond pas pour le moment. Réessayez dans un instant.";
  }
}
