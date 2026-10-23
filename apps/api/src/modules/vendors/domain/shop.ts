import { normalizeGabonPhone } from "./gabon-phone.js";
import { VendorsError } from "./vendors-error.js";

/**
 * Boutiques (S6-T01, ADR-0032). Règles pures, sans framework ni base.
 *
 * Cycle de vie d'une boutique de vendeur :
 *
 *   demande ──► pending ──valider──► active ──suspendre──► suspended
 *                  │                    ▲                       │
 *                refuser                └──────valider──────────┘
 *                  ▼
 *               rejected ──nouvelle demande──► pending
 *
 * La boutique Kemdia (`kind = "kemdia"`) est toujours active et ne passe par aucune décision.
 */
export type ShopStatus = "pending" | "active" | "rejected" | "suspended";
export type ShopKind = "kemdia" | "partner";

/** Longueurs (mêmes valeurs que SHOP_LIMITS du contrat et que la migration SQL ; vérifié par un test). */
export const SHOP_RULES = {
  nameMin: 3,
  nameMax: 60,
  cityMin: 2,
  cityMax: 60,
  descriptionMin: 20,
  descriptionMax: 500,
  reasonMin: 5,
  reasonMax: 300,
} as const;

/** Taille maximale de l'adresse lisible de base (un suffixe « -xxxx » peut s'y ajouter en cas de doublon). */
const SLUG_BASE_MAX = 60;

export interface Shop {
  id: string;
  kind: ShopKind;
  ownerAccountId: string | null;
  name: string;
  /** Clé d'unicité du nom ; vide pour une boutique refusée (le nom est libéré pour d'autres demandeurs) */
  nameKey: string | null;
  slug: string;
  city: string;
  /** Quartier (liste officielle de la livraison, S7.5-T07) ; `null` : « Autre quartier » ou pas encore choisi. */
  neighborhood: string | null;
  contactPhone: string | null;
  description: string;
  status: ShopStatus;
  statusReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  submittedAt: Date;
  createdAt: Date;
}

/** Demande de boutique, nettoyée et vérifiée. */
export interface ShopApplication {
  name: string;
  nameKey: string;
  slugBase: string;
  city: string;
  neighborhood: string | null;
  contactPhone: string;
  description: string;
}

// Lettres ASCII et lettres accentuées du français (À-ÿ sans × ni ÷, Œ, œ), chiffres, ponctuation simple. Toute autre
// lettre, même « latine » (ı, ɪ, ᴋ, ɑ…) ou d'un autre alphabet (е cyrillique), pourrait imiter un autre nom.
const LETTERS = "A-Za-zÀ-ÖØ-öø-ÿŒœ";
const NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9 '’&.,!\\-()]+$`);
const CITY_CHARACTERS = new RegExp(`^[${LETTERS}0-9 '’.,\\-()]+$`);

const invalid = (message: string) => new VendorsError("BOUTIQUE_INVALIDE", message);

// Caractères de contrôle (\p{Cc}, sauf le saut de ligne : la description en a besoin) et caractères invisibles de
// mise en forme (\p{Cf} : espaces de largeur nulle, marques de direction…) : jamais utiles, utiles pour tromper.
const CONTROL = /[^\P{Cc}\n]/gu;
const INVISIBLE = /\p{Cf}/gu;

/** Une ligne de texte : forme Unicode normale, invisibles retirés, espaces regroupés. */
export function cleanLine(raw: string): string {
  return (
    raw
      .normalize("NFC")
      // Invisibles d'abord : « \s » compte aussi l'indicateur d'ordre des octets (U+FEFF) comme une espace
      .replace(INVISIBLE, "")
      .replace(/\s/g, " ")
      .replace(CONTROL, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Un texte sur plusieurs lignes : chaque ligne nettoyée, deux lignes vides au plus. */
export function cleanText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]/g, " ")
    .replace(CONTROL, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Forme simple d'un nom : minuscules, sans accents, chaque suite de signes non alphanumériques réduite à une espace.
 * « Chez Ali ! », « chez-ali » et « CHÈZ ALI » donnent « chez ali ». Sert à l'adresse lisible.
 */
export function plainKeyOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[Œœ]/g, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Clé d'unicité d'un nom : sa forme simple, où les signes qui se ressemblent sont confondus (« l », « 1 » → « i » ;
 * « 0 » → « o »). « Chez Ali », « CHEZ ALI ! », « Chez A1i » et « Chez Al1 » ont la même clé : une seule de ces boutiques
 * peut exister, et « KEMDlA » ou « Kemd1a » sont reconnus comme « Kemdia ».
 */
export function nameKeyOf(name: string): string {
  return plainKeyOf(name).replace(/[1l]/g, "i").replace(/0/g, "o");
}

/** Adresse lisible tirée de la clé : « chez ali » → « chez-ali ». */
export function slugOf(nameKey: string): string {
  const slug = nameKey.replace(/ /g, "-").slice(0, SLUG_BASE_MAX);
  return slug.replace(/-+$/, "");
}

function requireLength(value: string, min: number, max: number, label: string): string {
  const length = [...value].length;
  if (length < min || length > max) {
    throw invalid(`${label} : entre ${min} et ${max} caractères`);
  }
  return value;
}

/**
 * Vérifie une demande de boutique. Refuse un nom qui reprend « Kemdia » (on ne se fait pas passer pour la boutique
 * officielle), un nom sans lettre ni chiffre latin, un mobile qui n'est pas gabonais.
 */
export function validateApplication(input: {
  name: string;
  city: string;
  /** Déjà vérifié par l'application (liste officielle des quartiers de la ville). */
  neighborhood?: string | null;
  phone: string;
  description: string;
}): ShopApplication {
  const name = requireLength(
    cleanLine(input.name),
    SHOP_RULES.nameMin,
    SHOP_RULES.nameMax,
    "le nom de la boutique",
  );
  if (!NAME_CHARACTERS.test(name)) {
    throw invalid(
      "le nom de la boutique : lettres, chiffres, espaces et ponctuation simple (' & . , ! - ( )) seulement",
    );
  }
  const plainKey = plainKeyOf(name);
  if (plainKey.length < SHOP_RULES.nameMin || plainKey.length > SHOP_RULES.nameMax) {
    throw invalid("le nom de la boutique doit contenir au moins 3 lettres ou chiffres");
  }
  const nameKey = nameKeyOf(name);
  if (nameKey.replace(/ /g, "").includes("kemdia")) {
    throw invalid("le nom de la boutique ne peut pas reprendre « Kemdia »");
  }
  const city = requireLength(
    cleanLine(input.city),
    SHOP_RULES.cityMin,
    SHOP_RULES.cityMax,
    "la ville",
  );
  if (!CITY_CHARACTERS.test(city)) {
    throw invalid("la ville : lettres, chiffres, espaces, apostrophes, points et tirets seulement");
  }
  const contactPhone = normalizeGabonPhone(input.phone);
  if (!contactPhone)
    throw invalid("le numéro de contact doit être un mobile gabonais (06… ou 07…)");
  const description = requireLength(
    cleanText(input.description),
    SHOP_RULES.descriptionMin,
    SHOP_RULES.descriptionMax,
    "la description",
  );
  return {
    name,
    nameKey,
    slugBase: slugOf(plainKey),
    city,
    neighborhood: input.neighborhood ?? null,
    contactPhone,
    description,
  };
}

/** Motif d'un refus ou d'une suspension (montré au vendeur). */
export function validateReason(raw: string): string {
  return requireLength(cleanText(raw), SHOP_RULES.reasonMin, SHOP_RULES.reasonMax, "le motif");
}

/** Nouvelle demande : boutique en attente, jamais examinée. */
export function newShop(
  id: string,
  ownerAccountId: string,
  slug: string,
  application: ShopApplication,
  now: Date,
): Shop {
  return {
    id,
    kind: "partner",
    ownerAccountId,
    name: application.name,
    nameKey: application.nameKey,
    slug,
    city: application.city,
    neighborhood: application.neighborhood,
    contactPhone: application.contactPhone,
    description: application.description,
    status: "pending",
    statusReason: null,
    reviewedBy: null,
    reviewedAt: null,
    submittedAt: now,
    createdAt: now,
  };
}

/**
 * Le demandeur redemande après un refus : la boutique repart « en attente » avec les nouvelles informations.
 * Une boutique en attente, active ou suspendue ne se redemande pas (`BOUTIQUE_EXISTE`).
 */
export function resubmit(shop: Shop, application: ShopApplication, slug: string, now: Date): Shop {
  if (shop.status !== "rejected") {
    throw new VendorsError("BOUTIQUE_EXISTE", "vous avez déjà une boutique");
  }
  return {
    ...shop,
    name: application.name,
    nameKey: application.nameKey,
    slug,
    city: application.city,
    neighborhood: application.neighborhood,
    contactPhone: application.contactPhone,
    description: application.description,
    status: "pending",
    statusReason: null,
    // Nouvelle demande : pas encore examinée (la décision précédente reste au journal d'audit)
    reviewedBy: null,
    reviewedAt: null,
    submittedAt: now,
  };
}

/** Ce que le vendeur change lui-même dans « Ma boutique » (S7.5-T07) : jamais le nom, l'adresse ni le téléphone. */
export interface ShopProfile {
  /** Ville et quartier déjà vérifiés par l'application (listes officielles de la livraison). */
  city: string;
  neighborhood: string | null;
  description: string;
}

/**
 * Le vendeur met à jour ville, quartier et description, sans nouvel examen (choix du 2026-10-23) : le nom, qui fait
 * l'identité de la boutique aux yeux des clients, ne change pas ici. Impossible pour une boutique refusée (elle refait
 * une demande) et pour la boutique Kemdia (pas de propriétaire).
 */
export function updateProfile(shop: Shop, profile: ShopProfile): Shop {
  if (shop.kind === "kemdia" || shop.status === "rejected") {
    throw new VendorsError(
      "STATUT_BOUTIQUE_INCOMPATIBLE",
      `action impossible : la boutique est « ${STATUS_LABELS[shop.status]} »`,
    );
  }
  const city = requireLength(
    cleanLine(profile.city),
    SHOP_RULES.cityMin,
    SHOP_RULES.cityMax,
    "la ville",
  );
  const description = requireLength(
    cleanText(profile.description),
    SHOP_RULES.descriptionMin,
    SHOP_RULES.descriptionMax,
    "la description",
  );
  return { ...shop, city, neighborhood: profile.neighborhood, description };
}

export type ShopDecision = "approve" | "reject" | "suspend";

/** État de départ accepté par chaque décision. */
const FROM: Record<ShopDecision, readonly ShopStatus[]> = {
  approve: ["pending", "suspended"],
  reject: ["pending"],
  suspend: ["active"],
};
const TO: Record<ShopDecision, ShopStatus> = {
  approve: "active",
  reject: "rejected",
  suspend: "suspended",
};

/**
 * Applique la décision d'un administrateur. Vérifié ici ET par la base : jamais sur sa propre boutique, jamais sur la
 * boutique Kemdia, seulement depuis l'état prévu ; un refus et une suspension ont un motif, une validation n'en a pas.
 */
export function decide(
  shop: Shop,
  decision: ShopDecision,
  by: { adminId: string; reason: string | null; now: Date },
): Shop {
  if (shop.kind === "kemdia") {
    throw new VendorsError(
      "STATUT_BOUTIQUE_INCOMPATIBLE",
      "la boutique Kemdia ne se valide, ne se refuse ni ne se suspend",
    );
  }
  if (shop.ownerAccountId?.toLowerCase() === by.adminId.toLowerCase()) {
    throw new VendorsError(
      "BOUTIQUE_SUR_SOI_INTERDITE",
      "vous ne pouvez pas décider pour votre propre boutique",
    );
  }
  if (!FROM[decision].includes(shop.status)) {
    throw new VendorsError(
      "STATUT_BOUTIQUE_INCOMPATIBLE",
      `action impossible : la boutique est « ${STATUS_LABELS[shop.status]} »`,
    );
  }
  const reason = decision === "approve" ? null : validateReason(by.reason ?? "");
  return {
    ...shop,
    status: TO[decision],
    statusReason: reason,
    // Un nom refusé est libéré : un autre demandeur (par exemple la vraie entreprise) peut le prendre
    nameKey: decision === "reject" ? null : shop.nameKey,
    reviewedBy: by.adminId,
    reviewedAt: by.now,
  };
}

export const STATUS_LABELS: Readonly<Record<ShopStatus, string>> = {
  pending: "en attente",
  active: "active",
  rejected: "refusée",
  suspended: "suspendue",
};
