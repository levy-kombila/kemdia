/**
 * Zone de couverture : Gabon uniquement (phase 1).
 * Zones, villes et frais vivent dans le contrat partagé depuis le S5-T02 (`@kemdia/contracts/delivery`) :
 * l'API y calcule le montant FACTURÉ ; ici, la même estimation sert à l'affichage (leçon CRIT-01 / HIGH-05).
 * Restent ici l'affichage des délais et des dates.
 */

export {
  CITIES,
  COUNTRY,
  ZONES,
  estimateDelivery,
  getCity,
  type City,
  type DeliveryEstimate,
  type DeliveryZone,
  type ZoneId,
} from "@kemdia/contracts/delivery";

export function formatDelay(min: number, max: number): string {
  if (min === max) return min === 1 ? "24 h" : `${min} jours`;
  if (max <= 2) return `${min * 24}–${max * 24} h`;
  return `${min} à ${max} jours`;
}

/** Ajoute des jours ouvrés (pas de livraison le dimanche). */
function addDeliveryDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) left--;
  }
  return d;
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** « jeu. 8 oct. – ven. 9 oct. » : fenêtre de livraison affichée sur la fiche produit. */
export function deliveryWindow(from: Date, daysMin: number, daysMax: number): string {
  const start = dayFormat.format(addDeliveryDays(from, daysMin));
  const end = dayFormat.format(addDeliveryDays(from, daysMax));
  return start === end ? start : `${start} – ${end}`;
}
