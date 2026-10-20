import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { CatalogError, type CatalogErrorCode } from "../../catalog/index.js";
import { IdentityError } from "../../identity/index.js";
import { VendorsError, type VendorsErrorCode } from "../domain/vendors-error.js";

/** Statut HTTP de chaque erreur métier du module vendors. */
const STATUS: Record<VendorsErrorCode, number> = {
  BOUTIQUE_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  BOUTIQUE_EXISTE: HttpStatus.CONFLICT,
  NOM_BOUTIQUE_PRIS: HttpStatus.CONFLICT,
  BOUTIQUE_INTROUVABLE: HttpStatus.NOT_FOUND,
  STATUT_BOUTIQUE_INCOMPATIBLE: HttpStatus.CONFLICT,
  BOUTIQUE_SUR_SOI_INTERDITE: HttpStatus.FORBIDDEN,
  PROPRIETAIRE_INACTIF: HttpStatus.CONFLICT,
  BOUTIQUE_OCCUPEE: HttpStatus.CONFLICT,
  // Produits des vendeurs et modération (S6-T02)
  BOUTIQUE_INACTIVE: HttpStatus.FORBIDDEN,
  PRODUIT_SUR_SOI_INTERDIT: HttpStatus.FORBIDDEN,
  // Vérification des vendeurs (S6-T08)
  KYC_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  KYC_INTROUVABLE: HttpStatus.NOT_FOUND,
  KYC_INCOMPLET: HttpStatus.CONFLICT,
  STATUT_KYC_INCOMPATIBLE: HttpStatus.CONFLICT,
  KYC_INDISPONIBLE: HttpStatus.SERVICE_UNAVAILABLE,
  DOCUMENT_INTROUVABLE: HttpStatus.NOT_FOUND,
  FORMAT_IMAGE_INVALIDE: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  IMAGE_TROP_GRANDE: HttpStatus.PAYLOAD_TOO_LARGE,
  IMAGE_TROP_PETITE: HttpStatus.UNPROCESSABLE_ENTITY,
};

/**
 * Erreurs du catalogue renvoyées par les routes des vendeurs et de la modération (S6-T02) : code de l'API et statut.
 * Les règles de détail d'un produit (prix, stock, référence, caractéristique…) sont toutes un `PRODUIT_INVALIDE`.
 */
const CATALOG: Record<CatalogErrorCode, { code: string; status: number }> = {
  IDENTIFIANT_INVALIDE: { code: "PRODUIT_INVALIDE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  SLUG_INVALIDE: { code: "PRODUIT_INVALIDE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  PRIX_INVALIDE: { code: "PRODUIT_INVALIDE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  STOCK_INVALIDE: { code: "PRODUIT_INVALIDE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  PRODUIT_INVALIDE: { code: "PRODUIT_INVALIDE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  VARIANTE_INVALIDE: { code: "PRODUIT_INVALIDE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  CATEGORIE_INVALIDE: { code: "PRODUIT_INVALIDE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  ARBORESCENCE_INVALIDE: { code: "PRODUIT_INVALIDE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  CATEGORIE_INCONNUE: { code: "CATEGORIE_INCONNUE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  PRODUIT_INTROUVABLE: { code: "PRODUIT_INTROUVABLE", status: HttpStatus.NOT_FOUND },
  VARIANTE_INTROUVABLE: { code: "VARIANTE_INTROUVABLE", status: HttpStatus.NOT_FOUND },
  STATUT_PRODUIT_INCOMPATIBLE: {
    code: "STATUT_PRODUIT_INCOMPATIBLE",
    status: HttpStatus.CONFLICT,
  },
  STOCK_MODIFIE: { code: "STOCK_MODIFIE", status: HttpStatus.CONFLICT },
  PRODUIT_MODIFIE: { code: "PRODUIT_MODIFIE", status: HttpStatus.CONFLICT },
  TROP_DE_PRODUITS_EN_ATTENTE: {
    code: "TROP_DE_PRODUITS_EN_ATTENTE",
    status: HttpStatus.CONFLICT,
  },
  // Photos (S6-T04)
  FORMAT_IMAGE_INVALIDE: {
    code: "FORMAT_IMAGE_INVALIDE",
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  },
  IMAGE_TROP_GRANDE: { code: "IMAGE_TROP_GRANDE", status: HttpStatus.PAYLOAD_TOO_LARGE },
  IMAGE_TROP_PETITE: { code: "IMAGE_TROP_PETITE", status: HttpStatus.UNPROCESSABLE_ENTITY },
  TROP_DE_PHOTOS: { code: "TROP_DE_PHOTOS", status: HttpStatus.CONFLICT },
  PHOTO_INTROUVABLE: { code: "PHOTO_INTROUVABLE", status: HttpStatus.NOT_FOUND },
  // Fiches communes et offres (S7.5-T02)
  FICHE_INTROUVABLE: { code: "FICHE_INTROUVABLE", status: HttpStatus.NOT_FOUND },
  FICHE_PUBLIEE: { code: "FICHE_PUBLIEE", status: HttpStatus.CONFLICT },
  FICHE_NON_PUBLIEE: { code: "FICHE_NON_PUBLIEE", status: HttpStatus.CONFLICT },
  DEJA_EN_VENTE: { code: "DEJA_EN_VENTE", status: HttpStatus.CONFLICT },
  DECLINAISON_INTROUVABLE: {
    code: "DECLINAISON_INTROUVABLE",
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  FUSION_IMPOSSIBLE: { code: "FUSION_IMPOSSIBLE", status: HttpStatus.CONFLICT },
  // Propositions de correction (S7.5-T03)
  CORRECTION_INTROUVABLE: { code: "CORRECTION_INTROUVABLE", status: HttpStatus.NOT_FOUND },
  TROP_DE_CORRECTIONS: { code: "TROP_DE_CORRECTIONS", status: HttpStatus.CONFLICT },
};

const capitalize = (message: string) => message.charAt(0).toUpperCase() + message.slice(1);

/** Exécute un cas d'utilisation ; une erreur métier devient une réponse HTTP avec son code. */
export async function withVendorsErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof VendorsError) {
      const retryAfter = error.code === "BOUTIQUE_OCCUPEE" ? 1 : undefined;
      throw new BusinessException(
        STATUS[error.code],
        capitalize(error.message),
        error.code,
        retryAfter,
      );
    }
    if (error instanceof CatalogError) {
      const { code, status } = CATALOG[error.code];
      throw new BusinessException(status, capitalize(error.message), code);
    }
    // Défense en profondeur : la garde HTTP refuse déjà un non-administrateur avant le cas d'utilisation
    if (error instanceof IdentityError && error.code === "ACCES_REFUSE") {
      throw new BusinessException(HttpStatus.FORBIDDEN, capitalize(error.message), error.code);
    }
    throw error;
  }
}

export const VENDORS_ERROR_STATUS = STATUS;
/** Codes de l'API produits à partir des erreurs du catalogue (test d'alignement). */
export const CATALOG_ERROR_CODES_FOR_VENDORS = [
  ...new Set(Object.values(CATALOG).map((entry) => entry.code)),
];
