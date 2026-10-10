import { normalizeGabonPhone } from "./gabon-phone.js";
import { OrdersError } from "./orders-error.js";

/** Ce que le domaine doit savoir d'une ville (la liste vit dans le contrat partagé, lue par l'application). */
export interface CityRule {
  id: string;
  name: string;
  neighborhoods: readonly string[];
}

export interface DeliveryAddress {
  fullName: string;
  /** +241… */
  phone: string;
  cityId: string;
  cityName: string;
  neighborhood: string;
  landmark: string;
}

export const LANDMARK_MIN = 5;
export const LANDMARK_MAX = 200;
export const OTHER_NEIGHBORHOOD = "Autre quartier";
const NAME_PART = /^[\p{L}][\p{L}\p{M}' -]*$/u;

function invalid(message: string): OrdersError {
  return new OrdersError("ADRESSE_INVALIDE", message);
}

/**
 * Texte imprimé sur l'étiquette du colis : forme Unicode normalisée (NFC : « Akébé » écrit d'une façon ou d'une autre
 * est le même mot), sans caractères de contrôle ni caractères invisibles ou d'inversion du sens d'écriture (\p{Cc},
 * \p{Cf}), espaces réduits.
 */
function clean(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Adresse de livraison (mêmes règles que le formulaire du site, qui les vérifie d'abord pour le confort) :
 * prénom et nom, mobile gabonais, ville connue, quartier de la ville (ou « Autre quartier »), point de repère.
 * Lève `ADRESSE_INVALIDE` avec le champ en cause.
 */
export function validateAddress(
  input: { fullName: string; phone: string; neighborhood: string; landmark: string },
  city: CityRule | null,
): DeliveryAddress {
  const fullName = clean(input.fullName);
  const parts = fullName.split(" ");
  if (
    fullName.length > 120 ||
    parts.length < 2 ||
    !parts.every((p) => p.length >= 2 && p.length <= 60 && NAME_PART.test(p))
  ) {
    throw invalid("nom : prénom et nom de la personne qui reçoit le colis");
  }
  const phone = normalizeGabonPhone(input.phone);
  if (!phone) throw invalid("téléphone : numéro gabonais à 9 chiffres (06… ou 07…)");
  if (!city) throw invalid("ville : choisissez une ville de livraison");
  const neighborhood = clean(input.neighborhood);
  if (
    city.neighborhoods.length > 0 &&
    neighborhood !== OTHER_NEIGHBORHOOD &&
    !city.neighborhoods.includes(neighborhood)
  ) {
    throw invalid("quartier : choisissez un quartier de la liste");
  }
  if (city.neighborhoods.length === 0 && neighborhood.length > 80) {
    throw invalid("quartier : 80 caractères au plus");
  }
  const landmark = clean(input.landmark);
  if (landmark.length < LANDMARK_MIN || landmark.length > LANDMARK_MAX) {
    throw invalid(`point de repère : ${LANDMARK_MIN} à ${LANDMARK_MAX} caractères`);
  }
  return {
    fullName,
    phone: phone.value,
    cityId: city.id,
    cityName: city.name,
    neighborhood,
    landmark,
  };
}
