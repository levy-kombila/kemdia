/**
 * Zone de couverture : Gabon uniquement (phase 1).
 * Barèmes repris de l'ancien projet (scripts/insert_location_data.py).
 *
 * IMPORTANT : côté navigateur, ce calcul est une ESTIMATION d'affichage.
 * Le montant facturé sera toujours recalculé par le backend (leçon CRIT-01 / HIGH-05).
 */

export type ZoneId = "zone_1" | "zone_2" | "zone_3" | "zone_4";

export type DeliveryZone = {
  id: ZoneId;
  label: string;
  baseFee: number;
  freeThreshold: number;
  daysMin: number;
  daysMax: number;
};

export type City = {
  id: string;
  name: string;
  zone: ZoneId;
  surcharge: number;
  neighborhoods: string[];
};

export const COUNTRY = { code: "GA", name: "Gabon", currency: "XAF", phoneCode: "+241" } as const;

export const ZONES: Record<ZoneId, DeliveryZone> = {
  zone_1: {
    id: "zone_1",
    label: "Libreville / Grand Libreville",
    baseFee: 0,
    freeThreshold: 25000,
    daysMin: 1,
    daysMax: 2,
  },
  zone_2: {
    id: "zone_2",
    label: "Grandes villes",
    baseFee: 2000,
    freeThreshold: 50000,
    daysMin: 2,
    daysMax: 3,
  },
  zone_3: {
    id: "zone_3",
    label: "Villes secondaires",
    baseFee: 3000,
    freeThreshold: 75000,
    daysMin: 3,
    daysMax: 4,
  },
  zone_4: {
    id: "zone_4",
    label: "Zones éloignées",
    baseFee: 4000,
    freeThreshold: 100000,
    daysMin: 4,
    daysMax: 7,
  },
};

export const CITIES: City[] = [
  {
    id: "libreville",
    name: "Libreville",
    zone: "zone_1",
    surcharge: 0,
    neighborhoods: [
      "Akébé",
      "Alénakiri",
      "Angondjé",
      "Batterie IV",
      "Charbonnages",
      "Damien",
      "Derrière la Prison",
      "Glass",
      "Gros Bouquet",
      "Lalala",
      "Mindoubé",
      "Mont-Bouët",
      "Nkembo",
      "Ntoum",
      "Oloumi",
      "Owendo",
      "PK5",
      "PK6",
      "PK7",
      "Rio",
      "Sablière",
      "Sainte-Anne",
    ],
  },
  {
    id: "port-gentil",
    name: "Port-Gentil",
    zone: "zone_2",
    surcharge: 0,
    neighborhoods: [
      "Centre",
      "Est",
      "Izamba",
      "Mandji",
      "Nord",
      "Ouest",
      "Petit Paris",
      "Remboué",
      "Sud",
      "Tchengué",
    ],
  },
  {
    id: "franceville",
    name: "Franceville",
    zone: "zone_2",
    surcharge: 500,
    neighborhoods: [
      "Bateke",
      "Centre-Ville",
      "Massoukou",
      "Mbaya",
      "Mouyondzi",
      "Ndjole",
      "Onangui",
      "Patinoire",
    ],
  },
  {
    id: "lambarene",
    name: "Lambaréné",
    zone: "zone_2",
    surcharge: 0,
    neighborhoods: ["Adouma", "Isaac", "Massima", "Rive Droite", "Rive Gauche"],
  },
  {
    id: "oyem",
    name: "Oyem",
    zone: "zone_3",
    surcharge: 0,
    neighborhoods: ["Akok", "Centre", "Minko", "Mvengue", "Nkolmvom", "Ntem"],
  },
  {
    id: "moanda",
    name: "Moanda",
    zone: "zone_3",
    surcharge: 0,
    neighborhoods: ["Baka", "Bangadi", "Centre-Ville", "Leyima", "Moukondo", "Mounana"],
  },
  {
    id: "mouila",
    name: "Mouila",
    zone: "zone_3",
    surcharge: 0,
    neighborhoods: ["Centre", "Douyé", "Mabanda", "Mouila-Ville", "Ngounié"],
  },
  {
    id: "tchibanga",
    name: "Tchibanga",
    zone: "zone_3",
    surcharge: 500,
    neighborhoods: ["Centre", "Dougnegn", "Mayumba", "Moukalaba", "Nyanga"],
  },
  {
    id: "koulamoutou",
    name: "Koulamoutou",
    zone: "zone_3",
    surcharge: 500,
    neighborhoods: ["Bouenguidi", "Centre", "Lébombi", "Mpassa", "Ogooué-Lolo"],
  },
  {
    id: "bitam",
    name: "Bitam",
    zone: "zone_3",
    surcharge: 0,
    neighborhoods: ["Bitam-Ville", "Centre", "Mongomo", "Ntem"],
  },
  {
    id: "mitzic",
    name: "Mitzic",
    zone: "zone_3",
    surcharge: 0,
    neighborhoods: ["Centre", "Mitzic-Ville", "Woleu"],
  },
  {
    id: "lastourville",
    name: "Lastourville",
    zone: "zone_3",
    surcharge: 0,
    neighborhoods: ["Centre", "Lastour", "Offoué"],
  },
  {
    id: "makokou",
    name: "Makokou",
    zone: "zone_4",
    surcharge: 0,
    neighborhoods: ["Centre", "Ivindo", "Liboumba", "Mvadi", "Ogooué"],
  },
];

export function getCity(id: string | null | undefined): City | undefined {
  return id ? CITIES.find((c) => c.id === id) : undefined;
}

export type DeliveryEstimate = {
  fee: number;
  isFree: boolean;
  daysMin: number;
  daysMax: number;
  freeThreshold: number;
  /** Montant restant pour obtenir la livraison gratuite (0 si déjà atteint) */
  remainingForFree: number;
};

export function estimateDelivery(cityId: string, subtotal: number): DeliveryEstimate | null {
  const city = getCity(cityId);
  if (!city) return null;
  const zone = ZONES[city.zone];
  const safeSubtotal = Math.max(0, Math.round(subtotal));
  const reachedFree = safeSubtotal >= zone.freeThreshold;
  const rawFee = zone.baseFee + city.surcharge;
  const fee = reachedFree ? 0 : rawFee;
  return {
    fee,
    isFree: fee === 0,
    daysMin: zone.daysMin,
    daysMax: zone.daysMax,
    freeThreshold: zone.freeThreshold,
    remainingForFree: reachedFree ? 0 : zone.freeThreshold - safeSubtotal,
  };
}

export function formatDelay(min: number, max: number): string {
  if (min === max) return min === 1 ? "24 h" : `${min} jours`;
  if (max <= 2) return `${min * 24}–${max * 24} h`;
  return `${min} à ${max} jours`;
}
