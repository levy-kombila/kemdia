/**
 * Livraison au Gabon (phase 1) : zones, villes, quartiers, frais — S5-T02, ADR-0024.
 * Barèmes repris de l'ancien projet (scripts/insert_location_data.py), déplacés du site vers le contrat :
 * l'API calcule ici le montant FACTURÉ, le site la même estimation d'affichage. Changer un tarif = une PR.
 *
 * Ce fichier n'importe RIEN (utilisable par le navigateur et par la couche application de l'API).
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
  neighborhoods: readonly string[];
};

export const COUNTRY = { code: "GA", name: "Gabon", currency: "XAF", phoneCode: "+241" } as const;

const ZONE_LIST: Record<ZoneId, DeliveryZone> = {
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

const CITY_LIST: City[] = [
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

/** Gel profond : l'API facture à partir de ces barèmes, aucun code ne doit pouvoir les modifier en cours de route. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

export const ZONES: Readonly<Record<ZoneId, Readonly<DeliveryZone>>> = deepFreeze(ZONE_LIST);
export const CITIES: readonly Readonly<City>[] = deepFreeze(CITY_LIST);

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

// --- Paiement à la livraison (BR-011) ---

/**
 * Valeurs PROVISOIRES (question ouverte n° 1 de regles-metier.md, pas encore fixée par le client) :
 * Grand Libreville uniquement, commande (livraison comprise) jusqu'à 100 000 FCFA. Réglage serveur au S5-T04.
 */
export const COD_ZONES: readonly ZoneId[] = ["zone_1"];
export const COD_MAX_TOTAL = 100_000;

export type CodAvailability = { allowed: true } | { allowed: false; reason: string };

export interface CodRule {
  readonly zones: readonly ZoneId[];
  readonly maxTotal: number;
}

/** Réglage par défaut (valeurs provisoires) ; l'API lit le réglage de l'administrateur en base (S5-T04, BR-011). */
export const DEFAULT_COD_RULE: CodRule = Object.freeze({
  zones: COD_ZONES,
  maxTotal: COD_MAX_TOTAL,
});

/** Montant lisible : « 100 000 » (espace entre les milliers). */
const amountText = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function codAvailability(
  cityId: string,
  total: number,
  rule: CodRule = DEFAULT_COD_RULE,
): CodAvailability {
  const city = getCity(cityId);
  if (rule.zones.length === 0) return { allowed: false, reason: "Pas disponible pour le moment." };
  if (!city || !rule.zones.includes(city.zone))
    return {
      allowed: false,
      reason:
        rule.zones.length === 1 && rule.zones[0] === "zone_1"
          ? "Disponible uniquement dans le Grand Libreville pour le moment."
          : "Pas disponible dans cette ville pour le moment.",
    };
  if (total > rule.maxTotal)
    return {
      allowed: false,
      reason: `Disponible pour les commandes jusqu'à ${amountText(rule.maxTotal)} FCFA.`,
    };
  return { allowed: true };
}

// --- Adresse de livraison ---

/** Point de repère : au Gabon, on se repère plus souvent ainsi que par numéro de rue. */
export const LANDMARK_MIN = 5;
export const LANDMARK_MAX = 200;
/** Quartier absent de la liste : la personne le précise dans le repère. */
export const OTHER_NEIGHBORHOOD = "Autre quartier";
