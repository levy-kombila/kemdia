/** Description OpenAPI des boutiques (S6-T01) ; les schémas viennent de @kemdia/contracts. */

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: string, description: string) => ({
  description,
  content: { "application/json": { schema: ref(id) } },
});
const problem = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: ref("ProblemDetails") } },
});
const bearer = [{ session: [] }];
const shopIdParam = {
  name: "shopId",
  in: "path",
  required: true,
  description: "Identifiant de la boutique",
  schema: { type: "string", format: "uuid" },
};

const sessionErrors = {
  "401": problem("`SESSION_INVALIDE` : jeton absent, inconnu, expiré ou fermé"),
};
const adminErrors = {
  ...sessionErrors,
  "403": problem(
    "`ACCES_REFUSE` (rôle administrateur requis), `DEUX_FACTEURS_A_ACTIVER` / `DEUX_FACTEURS_REQUIS` (double authentification à activer, ou à confirmer depuis 15 minutes) ou `BOUTIQUE_SUR_SOI_INTERDITE` (sa propre boutique)",
  ),
  "429": problem("Plus de 30 requêtes par minute, par adresse ou par compte (`TROP_DE_REQUETES`)"),
};
const decisionErrors = {
  ...adminErrors,
  "404": problem("`BOUTIQUE_INTROUVABLE`"),
  "409": problem(
    "`STATUT_BOUTIQUE_INCOMPATIBLE` (pas dans l'état prévu, ou boutique Kemdia), `PROPRIETAIRE_INACTIF` (compte du vendeur fermé) ou `BOUTIQUE_OCCUPEE` (réessayer)",
  ),
};

const OWNER_RULES = [
  "Compte connecté. **Une boutique par compte** ; elle attend la décision d'un administrateur avant toute vente.",
  "Nom unique (casse, accents et ponctuation ignorés), en lettres latines, chiffres et ponctuation simple, sans « Kemdia ». Mobile de contact gabonais.",
  "Après un **refus**, une nouvelle demande remplace l'ancienne et repart en attente.",
].join("\n\n");
const ADMIN_RULES = [
  "Réservé aux **administrateurs**, avec une session **confirmée par la double authentification** il y a moins de 15 minutes. Chaque décision est inscrite au journal d'audit.",
  "Valider (en attente ou suspendue → active) accorde le rôle **vendeur** ; suspendre (active → suspendue) le retire ; refuser (en attente → refusée) ne change aucun rôle. Boutique, rôle et journal changent ensemble ou pas du tout. Personne ne décide pour sa propre boutique ; la boutique Kemdia n'est jamais concernée.",
].join("\n\n");

const decision = (summary: string, operationId: string, withReason: boolean) => ({
  post: {
    tags: ["Boutiques"],
    summary,
    description: ADMIN_RULES,
    operationId,
    security: bearer,
    parameters: [shopIdParam],
    ...(withReason
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref("ShopDecisionReason") } },
          },
        }
      : {}),
    responses: {
      "200": json("AdminShop", "La boutique après la décision"),
      "400": problem(withReason ? "Corps ou identifiant invalide" : "Identifiant invalide"),
      ...decisionErrors,
      ...(withReason
        ? { "422": problem("`BOUTIQUE_INVALIDE` : motif trop court ou trop long") }
        : {}),
    },
  },
});

export const vendorsPaths = {
  "/api/v1/vendors/shop": {
    post: {
      tags: ["Boutiques"],
      summary: "Demander à ouvrir sa boutique",
      description: OWNER_RULES,
      operationId: "applyForShop",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ShopApplicationRequest") } },
      },
      responses: {
        "201": json("Shop", "La demande enregistrée (statut « pending »)"),
        "400": problem("Corps invalide"),
        ...sessionErrors,
        "409": problem(
          "`BOUTIQUE_EXISTE` (déjà une boutique en attente, active ou suspendue), `NOM_BOUTIQUE_PRIS` ou `BOUTIQUE_OCCUPEE` (réessayer)",
        ),
        "422": problem("`BOUTIQUE_INVALIDE` : champ mal rempli (détail dans le message)"),
        "429": problem("Plus de 5 demandes par minute pour ce compte (`TROP_DE_REQUETES`)"),
      },
    },
    get: {
      tags: ["Boutiques"],
      summary: "Ma boutique et la décision de l'administration",
      description: OWNER_RULES,
      operationId: "getMyShop",
      security: bearer,
      responses: {
        "200": json(
          "Shop",
          "La boutique du compte (motif affiché en cas de refus ou de suspension)",
        ),
        ...sessionErrors,
        "404": problem("`BOUTIQUE_INTROUVABLE` : aucune demande pour ce compte"),
      },
    },
  },
  "/api/v1/admin/shops": {
    get: {
      tags: ["Boutiques"],
      summary: "Boutiques, de la demande la plus ancienne à la plus récente",
      description: `${ADMIN_RULES}\n\nPage suivante : repasser \`nextCursor\` dans \`after\`.`,
      operationId: "listShops",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          description: "Seulement les boutiques dans cet état (ex. `pending` : la file à examiner)",
          schema: { type: "string", enum: ["pending", "active", "rejected", "suspended"] },
        },
        {
          name: "limit",
          in: "query",
          description: "Boutiques par page (50 par défaut, 100 au plus)",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
        {
          name: "after",
          in: "query",
          description: "`nextCursor` de la page précédente",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": json("AdminShopPage", "Une page de boutiques"),
        "400": problem("Paramètre invalide"),
        ...adminErrors,
      },
    },
  },
  "/api/v1/admin/shops/{shopId}": {
    get: {
      tags: ["Boutiques"],
      summary: "Une boutique",
      description: ADMIN_RULES,
      operationId: "getShop",
      security: bearer,
      parameters: [shopIdParam],
      responses: {
        "200": json("AdminShop", "La boutique"),
        "400": problem("Identifiant invalide"),
        ...adminErrors,
        "404": problem("`BOUTIQUE_INTROUVABLE`"),
      },
    },
  },
  "/api/v1/admin/shops/{shopId}/approve": decision(
    "Valider ou réactiver une boutique (rôle vendeur accordé)",
    "approveShop",
    false,
  ),
  "/api/v1/admin/shops/{shopId}/reject": decision(
    "Refuser une demande de boutique (motif montré au demandeur)",
    "rejectShop",
    true,
  ),
  "/api/v1/admin/shops/{shopId}/suspend": decision(
    "Suspendre une boutique (rôle vendeur retiré)",
    "suspendShop",
    true,
  ),
};

// --- Produits des vendeurs et modération (S6-T02) ---

const productIdParam = {
  name: "productId",
  in: "path",
  required: true,
  description: "Identifiant du produit",
  schema: { type: "string", format: "uuid" },
};
const variantIdParam = {
  name: "variantId",
  in: "path",
  required: true,
  description: "Identifiant de la variante",
  schema: { type: "string", format: "uuid" },
};
const pageParams = (statuses: string[], description: string) => [
  {
    name: "status",
    in: "query",
    description,
    schema: { type: "string", enum: statuses },
  },
  {
    name: "limit",
    in: "query",
    description: "Produits par page (50 par défaut, 100 au plus)",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
  {
    name: "after",
    in: "query",
    description: "`nextCursor` de la page précédente",
    schema: { type: "string" },
  },
];

const VENDOR_RULES = [
  "Rôle **vendeur** ET boutique **active** (vérifiée dans la transaction : une suspension attend la fin de l'écriture). Un produit d'une autre boutique est introuvable.",
  "Un produit créé, ou dont le titre, la description, la marque ou la catégorie change, part **en modération** et reste **invisible des clients** jusqu'à sa validation (BR-003) ; 50 produits en attente au plus par boutique. Le prix, le prix barré, le stock et l'activation d'une variante changent sans nouvelle modération, mais sont inscrits au journal d'audit.",
  "Pas encore de photos (tâche suivante) : le site affiche une image neutre.",
].join("\n\n");
const vendorErrors = {
  ...sessionErrors,
  "403": problem(
    "`ACCES_REFUSE` (rôle vendeur requis) ou `BOUTIQUE_INACTIVE` (aucune boutique active pour ce compte)",
  ),
  "429": problem("Trop de requêtes pour ce compte (`TROP_DE_REQUETES`)"),
};
const vendorProduct = (description: string) => json("VendorProduct", description);

const MODERATION_RULES = [
  "Réservé aux **modérateurs** et aux **administrateurs**, avec une session **confirmée par la double authentification** il y a moins de 15 minutes. Chaque décision est inscrite au journal d'audit.",
  "Seulement un produit **en attente**, et seulement **la version lue** : la décision porte le `submittedAt` lu ; si le vendeur a renvoyé le produit depuis, elle est refusée (`PRODUIT_MODIFIE`). Personne ne modère un produit de sa propre boutique. Un produit validé n'est visible que si sa boutique n'est pas suspendue.",
].join("\n\n");
const moderationErrors = {
  ...sessionErrors,
  "403": problem(
    "`ACCES_REFUSE` (rôle modérateur requis), `DEUX_FACTEURS_A_ACTIVER` / `DEUX_FACTEURS_REQUIS` (double authentification à activer, ou à confirmer depuis 15 minutes) ou `PRODUIT_SUR_SOI_INTERDIT`",
  ),
  "429": problem("Plus de 30 requêtes par minute, par adresse ou par compte (`TROP_DE_REQUETES`)"),
};

export const vendorProductPaths = {
  "/api/v1/vendors/products": {
    post: {
      tags: ["Produits des vendeurs"],
      summary: "Créer un produit (envoyé en modération)",
      description: VENDOR_RULES,
      operationId: "createVendorProduct",
      security: bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("VendorProductCreateRequest") } },
      },
      responses: {
        "201": vendorProduct("Le produit créé (statut « pending »)"),
        "400": problem("Corps invalide"),
        ...vendorErrors,
        "409": problem(
          "`TROP_DE_PRODUITS_EN_ATTENTE` (50 produits de la boutique attendent déjà) ou `BOUTIQUE_OCCUPEE`",
        ),
        "422": problem(
          "`PRODUIT_INVALIDE` (champ mal rempli, détail dans le message) ou `CATEGORIE_INCONNUE`",
        ),
      },
    },
    get: {
      tags: ["Produits des vendeurs"],
      summary: "Produits de ma boutique, du plus récent au plus ancien",
      description: VENDOR_RULES,
      operationId: "listVendorProducts",
      security: bearer,
      parameters: pageParams(
        ["draft", "pending", "published", "rejected", "archived"],
        "Seulement les produits dans cet état",
      ),
      responses: {
        "200": json("VendorProductPage", "Une page de produits"),
        "400": problem("Paramètre invalide"),
        ...vendorErrors,
      },
    },
  },
  "/api/v1/vendors/products/{productId}": {
    get: {
      tags: ["Produits des vendeurs"],
      summary: "Un produit de ma boutique",
      description: VENDOR_RULES,
      operationId: "getVendorProduct",
      security: bearer,
      parameters: [productIdParam],
      responses: {
        "200": vendorProduct("Le produit (motif affiché en cas de refus)"),
        "400": problem("Identifiant invalide"),
        ...vendorErrors,
        "404": problem("`PRODUIT_INTROUVABLE`"),
      },
    },
    put: {
      tags: ["Produits des vendeurs"],
      summary: "Modifier le contenu (repasse en modération)",
      description: VENDOR_RULES,
      operationId: "updateVendorProductContent",
      security: bearer,
      parameters: [productIdParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("VendorProductContentRequest") } },
      },
      responses: {
        "200": vendorProduct("Le produit, en attente de modération"),
        "400": problem("Corps ou identifiant invalide"),
        ...vendorErrors,
        "404": problem("`PRODUIT_INTROUVABLE`"),
        "409": problem(
          "`STATUT_PRODUIT_INCOMPATIBLE` (produit archivé), `TROP_DE_PRODUITS_EN_ATTENTE` ou `BOUTIQUE_OCCUPEE`",
        ),
        "422": problem("`PRODUIT_INVALIDE` ou `CATEGORIE_INCONNUE`"),
      },
    },
  },
  "/api/v1/vendors/products/{productId}/variants/{variantId}": {
    patch: {
      tags: ["Produits des vendeurs"],
      summary: "Prix, stock ou activation d'une variante (sans modération)",
      description: `${VENDOR_RULES}\n\nLe **stock** est la quantité disponible, hors commandes en cours. Pour le changer, renvoyer aussi \`previousStock\` (la valeur lue) : si une commande l'a modifié entre-temps, la requête est refusée (\`STOCK_MODIFIE\`) au lieu d'écraser la réservation.`,
      operationId: "updateVendorVariant",
      security: bearer,
      parameters: [productIdParam, variantIdParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("VendorVariantUpdateRequest") } },
      },
      responses: {
        "200": vendorProduct("Le produit après la modification"),
        "400": problem("Corps ou identifiant invalide"),
        ...vendorErrors,
        "404": problem("`PRODUIT_INTROUVABLE` ou `VARIANTE_INTROUVABLE`"),
        "409": problem(
          "`STOCK_MODIFIE` (relire le stock), `STATUT_PRODUIT_INCOMPATIBLE` (dernière variante active) ou `BOUTIQUE_OCCUPEE`",
        ),
        "422": problem("`PRODUIT_INVALIDE` (prix barré inférieur au prix…)"),
      },
    },
  },
  "/api/v1/vendors/products/{productId}/archive": {
    post: {
      tags: ["Produits des vendeurs"],
      summary: "Retirer de la vente (archiver)",
      description: `${VENDOR_RULES}\n\nUn produit n'est jamais supprimé : il peut figurer dans des commandes (BR-002).`,
      operationId: "archiveVendorProduct",
      security: bearer,
      parameters: [productIdParam],
      responses: {
        "200": vendorProduct("Le produit archivé"),
        "400": problem("Identifiant invalide"),
        ...vendorErrors,
        "404": problem("`PRODUIT_INTROUVABLE`"),
        "409": problem("`STATUT_PRODUIT_INCOMPATIBLE` (déjà archivé) ou `BOUTIQUE_OCCUPEE`"),
      },
    },
  },
  "/api/v1/vendors/products/{productId}/restore": {
    post: {
      tags: ["Produits des vendeurs"],
      summary: "Remettre en vente (repasse en modération)",
      description: VENDOR_RULES,
      operationId: "restoreVendorProduct",
      security: bearer,
      parameters: [productIdParam],
      responses: {
        "200": vendorProduct("Le produit, en attente de modération"),
        "400": problem("Identifiant invalide"),
        ...vendorErrors,
        "404": problem("`PRODUIT_INTROUVABLE`"),
        "409": problem(
          "`STATUT_PRODUIT_INCOMPATIBLE` (pas archivé), `TROP_DE_PRODUITS_EN_ATTENTE` ou `BOUTIQUE_OCCUPEE`",
        ),
      },
    },
  },
  "/api/v1/moderation/products": {
    get: {
      tags: ["Modération"],
      summary: "Produits à modérer, de la demande la plus ancienne à la plus récente",
      description: `${MODERATION_RULES}\n\nPage suivante : repasser \`nextCursor\` dans \`after\`.`,
      operationId: "listProductsToModerate",
      security: bearer,
      parameters: pageParams(
        ["pending", "published", "rejected"],
        "pending (par défaut) : la file à examiner",
      ),
      responses: {
        "200": json("ModerationProductPage", "Une page de produits"),
        "400": problem("Paramètre invalide"),
        ...moderationErrors,
      },
    },
  },
  "/api/v1/moderation/products/{productId}": {
    get: {
      tags: ["Modération"],
      summary: "Un produit de vendeur",
      description: MODERATION_RULES,
      operationId: "getProductToModerate",
      security: bearer,
      parameters: [productIdParam],
      responses: {
        "200": json("ModerationProduct", "Le produit et sa boutique"),
        "400": problem("Identifiant invalide"),
        ...moderationErrors,
        "404": problem("`PRODUIT_INTROUVABLE`"),
      },
    },
  },
  "/api/v1/moderation/products/{productId}/approve": {
    post: {
      tags: ["Modération"],
      summary: "Valider un produit (visible des clients)",
      description: MODERATION_RULES,
      operationId: "approveProduct",
      security: bearer,
      parameters: [productIdParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ProductApproval") } },
      },
      responses: {
        "200": json("ModerationProduct", "Le produit après la décision"),
        "400": problem("Identifiant invalide"),
        ...moderationErrors,
        "404": problem("`PRODUIT_INTROUVABLE`"),
        "409": problem(
          "`STATUT_PRODUIT_INCOMPATIBLE` (pas en attente), `PRODUIT_MODIFIE` (le vendeur l'a renvoyé depuis votre lecture : relire) ou `BOUTIQUE_OCCUPEE`",
        ),
      },
    },
  },
  "/api/v1/moderation/products/{productId}/reject": {
    post: {
      tags: ["Modération"],
      summary: "Refuser un produit (motif montré au vendeur)",
      description: MODERATION_RULES,
      operationId: "rejectProduct",
      security: bearer,
      parameters: [productIdParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ProductModerationReason") } },
      },
      responses: {
        "200": json("ModerationProduct", "Le produit après la décision"),
        "400": problem("Corps ou identifiant invalide"),
        ...moderationErrors,
        "404": problem("`PRODUIT_INTROUVABLE`"),
        "409": problem(
          "`STATUT_PRODUIT_INCOMPATIBLE` (pas en attente), `PRODUIT_MODIFIE` (le vendeur l'a renvoyé depuis votre lecture : relire) ou `BOUTIQUE_OCCUPEE`",
        ),
        "422": problem("`PRODUIT_INVALIDE` : motif trop court ou trop long"),
      },
    },
  },
};

const imageIdParam = {
  name: "imageId",
  in: "path",
  required: true,
  description: "Identifiant de la photo (celui de son adresse `/images/v/<id>.webp`)",
  schema: { type: "string", format: "uuid" },
};
const webp = (description: string) => ({
  description,
  headers: {
    ETag: { description: "Empreinte de la photo", schema: { type: "string" } },
    "Cache-Control": { description: "`private, no-store`", schema: { type: "string" } },
  },
  content: { "image/webp": { schema: { type: "string", format: "binary" } } },
});
const PHOTO_RULES = [
  "Photos d'un produit de **ma** boutique (S6-T04, ADR-0035), 10 au plus. Fichier **JPEG, PNG ou WebP** de **5 Mo** au plus, 200 pixels au moins de chaque côté, 40 mégapixels au plus.",
  "Le fichier n'est jamais gardé tel quel : il est **réencodé en WebP** (1 600 px et vignette de 480 px), redressé, et **toutes ses métadonnées sont retirées** (position GPS, appareil). Le format est reconnu par le contenu, pas par le nom ni le type annoncé.",
  "Ajouter une photo **renvoie le produit en modération** (BR-003) ; la retirer ou changer l'ordre ne le fait pas. Une photo n'est servie au public que si son produit est validé et sa boutique active.",
].join("\n\n");

export const productImagePaths = {
  "/api/v1/vendors/products/{productId}/images": {
    post: {
      tags: ["Produits des vendeurs"],
      summary: "Ajouter une photo (le produit repasse en modération)",
      description: `${PHOTO_RULES}\n\nCorps : **le fichier lui-même** (pas de formulaire ni de JSON), avec l'en-tête \`Content-Type\` \`image/jpeg\`, \`image/png\` ou \`image/webp\`. 20 envois par minute et par compte.`,
      operationId: "addVendorProductImage",
      security: bearer,
      parameters: [productIdParam],
      requestBody: {
        required: true,
        content: {
          "image/jpeg": { schema: { type: "string", format: "binary" } },
          "image/png": { schema: { type: "string", format: "binary" } },
          "image/webp": { schema: { type: "string", format: "binary" } },
        },
      },
      responses: {
        "201": vendorProduct(
          "Le produit, en attente de modération, avec la nouvelle photo en dernier",
        ),
        "400": problem("Identifiant invalide"),
        ...vendorErrors,
        "404": problem("`PRODUIT_INTROUVABLE`"),
        "409": problem(
          "`TROP_DE_PHOTOS` (10 déjà), `STATUT_PRODUIT_INCOMPATIBLE` (archivé), `TROP_DE_PRODUITS_EN_ATTENTE` ou `BOUTIQUE_OCCUPEE`",
        ),
        "413": problem(
          "Fichier de plus de 5 Mo, image de plus de 40 mégapixels ou trop longue à traiter (`IMAGE_TROP_GRANDE`)",
        ),
        "415": problem("`FORMAT_IMAGE_INVALIDE` : pas un JPEG, PNG ou WebP lisible"),
        "422": problem("`IMAGE_TROP_PETITE` : moins de 200 pixels d'un côté"),
        "503": problem(
          "Trop d'envois de photos en même temps sur toute l'API : réessayer après `Retry-After` secondes",
        ),
      },
    },
    put: {
      tags: ["Produits des vendeurs"],
      summary: "Changer l'ordre des photos (sans nouvelle modération)",
      description: `${PHOTO_RULES}\n\nToutes les photos du produit, chacune une fois ; la première devient la principale.`,
      operationId: "reorderVendorProductImages",
      security: bearer,
      parameters: [productIdParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ProductImageOrderRequest") } },
      },
      responses: {
        "200": vendorProduct("Le produit, photos dans le nouvel ordre"),
        "400": problem("Corps invalide"),
        ...vendorErrors,
        "404": problem("`PRODUIT_INTROUVABLE`"),
        "409": problem("`BOUTIQUE_OCCUPEE`"),
        "422": problem("`PRODUIT_INVALIDE` : liste différente des photos du produit"),
      },
    },
  },
  "/api/v1/vendors/products/{productId}/images/{imageId}": {
    get: {
      tags: ["Produits des vendeurs"],
      summary: "Voir une photo (quel que soit le statut du produit)",
      description: PHOTO_RULES,
      operationId: "getVendorProductImage",
      security: bearer,
      parameters: [productIdParam, imageIdParam],
      responses: {
        "200": webp("La grande image (WebP)"),
        "304": { description: "Inchangée (`If-None-Match`)" },
        "400": problem("Identifiant invalide"),
        ...vendorErrors,
        "404": problem("`PRODUIT_INTROUVABLE` ou `PHOTO_INTROUVABLE`"),
      },
    },
    delete: {
      tags: ["Produits des vendeurs"],
      summary: "Retirer une photo (tout de suite, effacée)",
      description: `${PHOTO_RULES}\n\nLa photo est effacée et n'est plus jamais servie (les copies en cache disparaissent en quelques minutes). Inscrit au journal d'audit.`,
      operationId: "deleteVendorProductImage",
      security: bearer,
      parameters: [productIdParam, imageIdParam],
      responses: {
        "200": vendorProduct("Le produit sans cette photo"),
        "400": problem("Identifiant invalide"),
        ...vendorErrors,
        "404": problem("`PRODUIT_INTROUVABLE` ou `PHOTO_INTROUVABLE`"),
        "409": problem("`BOUTIQUE_OCCUPEE`"),
      },
    },
  },
  "/api/v1/moderation/products/{productId}/images/{imageId}": {
    get: {
      tags: ["Modération"],
      summary: "Voir une photo d'un produit à modérer",
      description: `${MODERATION_RULES}\n\nQuel que soit le statut du produit : la modération voit ce qu'elle valide. 120 photos par minute.`,
      operationId: "getModerationProductImage",
      security: bearer,
      parameters: [productIdParam, imageIdParam],
      responses: {
        "200": webp("La grande image (WebP)"),
        "304": { description: "Inchangée (`If-None-Match`)" },
        "400": problem("Identifiant invalide"),
        ...moderationErrors,
        "404": problem("`PRODUIT_INTROUVABLE` ou `PHOTO_INTROUVABLE`"),
      },
    },
  },
};

// --- Commandes des vendeurs (S6-T07, ADR-0038 ; BR-013) ---

const referenceParam = {
  name: "reference",
  in: "path",
  required: true,
  description: "Numéro de la commande (« KMD-7F3K9Q »)",
  schema: { type: "string", pattern: "^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$" },
};
const VENDOR_ORDER_RULES = [
  "Rôle **vendeur** ET boutique **active** (vérifiée dans la transaction). Seules les commandes **confirmées** (payées, ou paiement à la livraison) qui contiennent un produit de la boutique apparaissent ; une autre commande est introuvable.",
  "Le vendeur ne voit que **ses** articles et la **ville** de livraison : ni le nom, ni le téléphone, ni l'adresse du client.",
  "Il a **24 heures** pour accepter ou refuser. Quand toutes les boutiques de la commande ont accepté, elle passe « en préparation ». Un **refus** (motif gardé par Kemdia, jamais montré au client) ou l'**absence de réponse** annule la commande **entière** : stock remis en vente, coupon rendu, remboursement « à faire » si elle était payée. Chaque décision est inscrite au journal d'audit ; un e-mail prévient le vendeur de chaque nouvelle commande.",
].join("\n\n");
const vendorOrderErrors = {
  ...vendorErrors,
  "404": problem("`COMMANDE_INTROUVABLE`"),
};
const vendorDecision = (summary: string, operationId: string, refuse: boolean) => ({
  post: {
    tags: ["Commandes des vendeurs"],
    summary,
    description: VENDOR_ORDER_RULES,
    operationId,
    security: bearer,
    parameters: [referenceParam],
    ...(refuse
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref("VendorOrderRefuseRequest") } },
          },
        }
      : {}),
    responses: {
      "200": json(
        "VendorOrder",
        refuse
          ? "La commande après le refus (annulée) ; déjà refusée : renvoyée telle quelle"
          : "La commande après l'acceptation ; déjà acceptée : renvoyée telle quelle",
      ),
      "400": problem(refuse ? "Corps ou numéro invalide" : "Numéro invalide"),
      ...vendorOrderErrors,
      "409": problem(
        "`DECISION_IMPOSSIBLE` (déjà décidée, commande annulée, délai passé), `ANNULATION_IMPOSSIBLE` (déjà encaissée en espèces) ou `BOUTIQUE_OCCUPEE` (réessayer)",
      ),
      ...(refuse ? { "422": problem("`MOTIF_REFUS_INVALIDE` : motif de 5 à 300 caractères") } : {}),
    },
  },
});

export const vendorOrderPaths = {
  "/api/v1/vendors/orders": {
    get: {
      tags: ["Commandes des vendeurs"],
      summary: "Commandes de ma boutique, de la plus récente à la plus ancienne",
      description: VENDOR_ORDER_RULES,
      operationId: "listVendorOrders",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          description:
            "Seulement : `pending` (à traiter), `accepted`, `refused`, `expired` (sans réponse à temps) ou `cancelled` (annulée autrement)",
          schema: {
            type: "string",
            enum: ["pending", "accepted", "refused", "expired", "cancelled"],
          },
        },
        {
          name: "limit",
          in: "query",
          description: "Commandes par page (20 par défaut, 50 au plus)",
          schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
        {
          name: "before",
          in: "query",
          description: "`nextCursor` de la page précédente",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": json("VendorOrderPage", "Une page de commandes"),
        "400": problem("Paramètre invalide"),
        ...vendorErrors,
      },
    },
  },
  "/api/v1/vendors/orders/{reference}": {
    get: {
      tags: ["Commandes des vendeurs"],
      summary: "Une commande de ma boutique (mes articles, la ville de livraison)",
      description: VENDOR_ORDER_RULES,
      operationId: "getVendorOrder",
      security: bearer,
      parameters: [referenceParam],
      responses: {
        "200": json("VendorOrder", "La commande, vue par la boutique"),
        "400": problem("Numéro invalide"),
        ...vendorOrderErrors,
      },
    },
  },
  "/api/v1/vendors/orders/{reference}/accept": vendorDecision(
    "Accepter la commande",
    "acceptVendorOrder",
    false,
  ),
  "/api/v1/vendors/orders/{reference}/refuse": vendorDecision(
    "Refuser la commande (elle est annulée entière)",
    "refuseVendorOrder",
    true,
  ),

  ...kycPaths(),
};

// --- Vérification des vendeurs, KYC (S6-T08, ADR-0039 ; BR-024) ---

function kycPaths() {
  const KYC_RULES = [
    "Rôle **vendeur** et boutique **active**. Un KYC non validé bloque seulement les **versements** (BR-024), pas les ventes.",
    "Numéro de la pièce, compte de versement et photos sont **chiffrés** (AES-256-GCM) ; le vendeur ne revoit que les 4 derniers caractères et la liste des photos reçues. Photos exigées : recto ; verso sauf passeport ; extrait RCCM pour une entreprise.",
    "Modifiable « en préparation » ou après un refus ; envoyé, il attend l'équipe ; validé, il ne change plus (service client). Sans clé de chiffrement sur le serveur : `KYC_INDISPONIBLE` (503).",
  ].join("\n\n");
  const ADMIN_KYC_RULES = [
    "Réservé aux **administrateurs** (pas aux modérateurs), session confirmée par la double authentification depuis moins de 15 minutes.",
    "Seuls les dossiers **envoyés** sont visibles (un brouillon reste chez le vendeur). Ouvrir un dossier (numéros complets) et regarder une photo sont **inscrits au journal d'audit**. Photos effacées **30 jours après la décision**.",
  ].join("\n\n");
  const kycErrors = {
    ...vendorErrors,
    "503": problem("`KYC_INDISPONIBLE` : clé de chiffrement absente sur le serveur"),
  };
  const kindParam = {
    name: "kind",
    in: "path",
    required: true,
    description: "`id_front` (recto), `id_back` (verso) ou `rccm` (extrait RCCM)",
    schema: { type: "string", enum: ["id_front", "id_back", "rccm"] },
  };
  const adminKycErrors = {
    ...adminErrors,
    "404": problem("`KYC_INTROUVABLE` (aucun dossier envoyé pour cette boutique)"),
    "503": problem("`KYC_INDISPONIBLE`"),
  };
  const adminDecision = (summary: string, operationId: string, withReason: boolean) => ({
    post: {
      tags: ["Vérification des vendeurs"],
      summary,
      description: ADMIN_KYC_RULES,
      operationId,
      security: bearer,
      parameters: [shopIdParam],
      ...(withReason
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: ref("ShopDecisionReason") } },
            },
          }
        : {}),
      responses: {
        "204": { description: "Décision enregistrée (photos effacées dans 30 jours)" },
        "400": problem("Identifiant invalide"),
        ...adminKycErrors,
        "409": problem("`STATUT_KYC_INCOMPATIBLE` (le dossier n'est pas en attente)"),
        ...(withReason ? { "422": problem("`KYC_INVALIDE` : motif de 5 à 300 caractères") } : {}),
      },
    },
  });
  return {
    "/api/v1/vendors/kyc": {
      get: {
        tags: ["Vérification des vendeurs"],
        summary: "Mon dossier de vérification",
        description: KYC_RULES,
        operationId: "getVendorKyc",
        security: bearer,
        responses: {
          "200": json("VendorKyc", "Le dossier (numéros masqués)"),
          ...kycErrors,
          "404": problem("`KYC_INTROUVABLE` : pas encore de dossier"),
        },
      },
      put: {
        tags: ["Vérification des vendeurs"],
        summary: "Créer ou modifier mon dossier (il repasse en préparation)",
        description: KYC_RULES,
        operationId: "saveVendorKyc",
        security: bearer,
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("KycRequest") } },
        },
        responses: {
          "200": json("VendorKyc", "Le dossier enregistré"),
          ...kycErrors,
          "409": problem("`STATUT_KYC_INCOMPATIBLE` (dossier envoyé ou validé)"),
          "422": problem("`KYC_INVALIDE` (champ en cause dans le message)"),
        },
      },
    },
    "/api/v1/vendors/kyc/documents/{kind}": {
      post: {
        tags: ["Vérification des vendeurs"],
        summary: "Envoyer une photo du dossier (remplace la précédente)",
        description: `${KYC_RULES}\n\nCorps : le fichier lui-même (JPEG, PNG ou WebP, 5 Mo au plus, 300 px au moins de chaque côté). Réencodé en WebP sans métadonnées, puis chiffré. 10 envois par minute au plus.`,
        operationId: "uploadVendorKycDocument",
        security: bearer,
        parameters: [kindParam],
        requestBody: {
          required: true,
          content: {
            "image/jpeg": { schema: { type: "string", format: "binary" } },
            "image/png": { schema: { type: "string", format: "binary" } },
            "image/webp": { schema: { type: "string", format: "binary" } },
          },
        },
        responses: {
          "200": json("VendorKyc", "Le dossier à jour"),
          ...kycErrors,
          "404": problem("`KYC_INTROUVABLE` : remplir le dossier d'abord"),
          "409": problem("`STATUT_KYC_INCOMPATIBLE`"),
          "413": problem("`IMAGE_TROP_GRANDE`"),
          "415": problem("`FORMAT_IMAGE_INVALIDE`"),
          "422": problem("`IMAGE_TROP_PETITE` ou `KYC_INVALIDE` (photo non demandée)"),
        },
      },
    },
    "/api/v1/vendors/kyc/submit": {
      post: {
        tags: ["Vérification des vendeurs"],
        summary: "Envoyer mon dossier à l'équipe Kemdia",
        description: KYC_RULES,
        operationId: "submitVendorKyc",
        security: bearer,
        responses: {
          "200": json("VendorKyc", "Le dossier, en attente"),
          ...kycErrors,
          "404": problem("`KYC_INTROUVABLE`"),
          "409": problem("`KYC_INCOMPLET` (photos manquantes) ou `STATUT_KYC_INCOMPATIBLE`"),
        },
      },
    },
    "/api/v1/admin/kyc": {
      get: {
        tags: ["Vérification des vendeurs"],
        summary: "File des dossiers envoyés (du plus ancien envoi au plus récent)",
        description: ADMIN_KYC_RULES,
        operationId: "listKyc",
        security: bearer,
        parameters: pageParams(["pending", "approved", "rejected"], "Seulement ce statut").map(
          (p) =>
            p.name === "limit"
              ? { ...p, description: "Dossiers par page (50 par défaut, 100 au plus)" }
              : p,
        ),
        responses: {
          "200": json("AdminKycPage", "Une page de dossiers"),
          "400": problem("Paramètre invalide"),
          ...adminErrors,
          "503": problem("`KYC_INDISPONIBLE`"),
        },
      },
    },
    "/api/v1/admin/kyc/{shopId}": {
      get: {
        tags: ["Vérification des vendeurs"],
        summary: "Un dossier, numéros complets (consultation au journal d'audit)",
        description: ADMIN_KYC_RULES,
        operationId: "getKyc",
        security: bearer,
        parameters: [shopIdParam],
        responses: {
          "200": json("AdminKyc", "Le dossier"),
          "400": problem("Identifiant invalide"),
          ...adminKycErrors,
        },
      },
    },
    "/api/v1/admin/kyc/{shopId}/documents/{kind}": {
      get: {
        tags: ["Vérification des vendeurs"],
        summary: "Une photo du dossier, déchiffrée (consultation au journal d'audit)",
        description: ADMIN_KYC_RULES,
        operationId: "getKycDocument",
        security: bearer,
        parameters: [shopIdParam, kindParam],
        responses: {
          "200": {
            description: "La photo (WebP), jamais mise en cache",
            content: { "image/webp": { schema: { type: "string", format: "binary" } } },
          },
          "400": problem("Paramètre invalide"),
          ...adminKycErrors,
          "404": problem(
            "`KYC_INTROUVABLE` ou `DOCUMENT_INTROUVABLE` (jamais envoyée, ou effacée)",
          ),
        },
      },
    },
    "/api/v1/admin/kyc/{shopId}/approve": adminDecision("Valider le dossier", "approveKyc", false),
    "/api/v1/admin/kyc/{shopId}/reject": adminDecision(
      "Refuser le dossier (motif montré au vendeur)",
      "rejectKyc",
      true,
    ),
  };
}
