"use client";

import { CITIES, OTHER_NEIGHBORHOOD } from "@kemdia/contracts/delivery";
import { SelectField } from "@/components/ui/Field";

/**
 * Ville et quartier d'une boutique (S7.5-T07, ADR-0054) : listes officielles de la livraison, pour que « boutiques près
 * de chez moi » compare des noms identiques. Changer de ville vide le quartier. « Autre quartier » : non précisé.
 */
export function ShopPlaceFields({
  city,
  neighborhood,
  onChange,
  errors,
}: {
  city: string;
  neighborhood: string;
  onChange: (place: { city: string; neighborhood: string }) => void;
  errors: { city?: string | undefined; neighborhood?: string | undefined };
}) {
  const current = CITIES.find((c) => c.name === city);
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <SelectField
        label="Ville"
        name="city"
        value={current ? current.name : ""}
        onChange={(e) => onChange({ city: e.target.value, neighborhood: "" })}
        error={errors.city}
        hint={
          city && !current ? `Ville actuelle « ${city} » : choisissez-la dans la liste.` : undefined
        }
        required
      >
        <option value="" disabled>
          Choisir la ville
        </option>
        {CITIES.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Quartier"
        name="neighborhood"
        value={neighborhood}
        onChange={(e) => onChange({ city, neighborhood: e.target.value })}
        error={errors.neighborhood}
        disabled={!current}
        hint="Les clients du même quartier voient votre boutique en premier."
      >
        <option value="">{OTHER_NEIGHBORHOOD}</option>
        {current?.neighborhoods.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
