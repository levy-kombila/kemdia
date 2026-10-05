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
