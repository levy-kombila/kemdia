import { CITIES, OTHER_NEIGHBORHOOD } from "@kemdia/contracts/delivery";
import { VendorsError } from "../domain/vendors-error.js";

/**
 * Ville et quartier d'une boutique (S7.5-T07, ADR-0054) : choisis dans les listes officielles de la livraison, pour que
 * « boutiques près de chez moi » compare des noms identiques. « Autre quartier » (ou rien) : quartier vide.
 */
export function resolveShopPlace(
  city: string,
  neighborhood: string | null | undefined,
): { city: string; neighborhood: string | null } {
  const found = CITIES.find((c) => c.name === city.trim());
  if (!found) {
    throw new VendorsError("BOUTIQUE_INVALIDE", "la ville doit être choisie dans la liste");
  }
  const quarter = neighborhood?.trim() ?? "";
  if (!quarter || quarter === OTHER_NEIGHBORHOOD) return { city: found.name, neighborhood: null };
  if (!found.neighborhoods.includes(quarter)) {
    throw new VendorsError(
      "BOUTIQUE_INVALIDE",
      `le quartier doit être choisi dans la liste de ${found.name}`,
    );
  }
  return { city: found.name, neighborhood: quarter };
}
