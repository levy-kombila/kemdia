/** Description OpenAPI des données personnelles (S7-T08, ADR-0047) ; les schémas viennent de @kemdia/contracts. */

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const problem = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: ref("ProblemDetails") } },
});
const bearer = [{ session: [] }];
const sessionRefused = problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé");
const tooMany = problem("Plus de 5 requêtes par minute pour ce compte (`TROP_DE_REQUETES`)");

export const privacyPaths: Record<string, unknown> = {
  "/api/v1/account/data": {
    get: {
      tags: ["Données personnelles"],
      summary: "Copie de mes données (fichier JSON)",
      description:
        "Droit d'accès et portabilité (loi n°001/2011 modifiée, art. 43 et 58). Compte, rôles, appareils connectés, " +
        "commandes, paiements, factures, livraisons, boutique. Jamais de mot de passe, jeton, code ni photo de pièce " +
        "d'identité. Chaque copie est inscrite au journal d'audit. Réponse à enregistrer (`Content-Disposition: attachment`).",
      operationId: "exportAccountData",
      security: bearer,
      responses: {
        "200": {
          description: "La copie",
          headers: {
            "Content-Disposition": {
              description: 'attachment; filename="kemdia-mes-donnees.json"',
              schema: { type: "string" },
            },
          },
          content: { "application/json": { schema: ref("AccountDataExport") } },
        },
        "401": sessionRefused,
        "429": tooMany,
      },
    },
  },
  "/api/v1/account/deletion": {
    get: {
      tags: ["Données personnelles"],
      summary: "La suppression de mon compte est-elle possible maintenant ?",
      operationId: "accountDeletionStatus",
      security: bearer,
      responses: {
        "200": {
          description: "Possible, ou ce qui l'empêche",
          content: { "application/json": { schema: ref("AccountDeletionStatus") } },
        },
        "401": sessionRefused,
      },
    },
  },
  "/api/v1/account/delete": {
    post: {
      tags: ["Données personnelles"],
      summary: "Supprimer mon compte (mot de passe actuel)",
      description:
        "Droit à l'effacement (art. 50 à 53). Effacement immédiat et définitif : nom, e-mail, téléphone, adresses, " +
        "appareils, panier, dossier de vérification ; sessions fermées. Les commandes et factures restent (10 ans, " +
        "OHADA) telles qu'émises (une facture ne change jamais) ; les commandes sont anonymisées. Refusé tant qu'une commande, un remboursement, une boutique ou un rôle d'équipe est " +
        "en cours. Au 3ᵉ mot de passe faux : blocage de 15 minutes et session fermée. Un avis est envoyé à l'ancienne adresse.",
      operationId: "deleteAccount",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("DeleteAccountRequest") } },
      },
      responses: {
        "204": { description: "Compte supprimé" },
        "400": problem("Corps invalide (case de confirmation non cochée, champ en trop…)"),
        "401": sessionRefused,
        "409": problem(
          "`COMMANDE_EN_COURS`, `REMBOURSEMENT_EN_ATTENTE`, `PAIEMENT_EN_ATTENTE`, `BOUTIQUE_OUVERTE` ou `COMPTE_EQUIPE`",
        ),
        "422": problem("`MOT_DE_PASSE_INCORRECT`"),
        "429": problem(
          "`COMPTE_BLOQUE` : 3 mots de passe faux (15 minutes), ou `TROP_DE_REQUETES`",
        ),
      },
    },
  },
};
