const fcfa = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 125000 → "125 000 FCFA" (espaces insécables normalisés pour un rendu stable SSR/navigateur) */
export function formatFCFA(amount: number): string {
  return `${fcfa.format(Math.round(amount)).replace(/\s/g, " ")} FCFA`;
}

export function discountPercent(price: number, oldPrice: number | null): number | null {
  if (!oldPrice || oldPrice <= price || oldPrice <= 0) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Normalise une chaîne pour la recherche : minuscules, sans accents. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Heure du Gabon, quel que soit le fuseau du serveur ou du navigateur : même rendu des deux côtés. */
const GABON = "Africa/Libreville";
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: GABON,
});
const timeFormat = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: GABON,
});

/** "2026-10-15T13:52:00Z" → "15 octobre 2026" (heure du Gabon) */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "2026-10-15T13:52:00Z" → "14:52" (heure du Gabon) */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso)).replace(/\s/g, " ");
}

/** "15 octobre 2026 à 14:52" (heure du Gabon) */
export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} à ${formatTime(iso)}`;
}
