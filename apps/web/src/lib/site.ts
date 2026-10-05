export const SITE = {
  name: "Kemdia",
  domainSuffix: ".ga",
  tagline: "Le shopping en ligne, livré partout au Gabon",
  description:
    "Kemdia, votre boutique en ligne au Gabon : high-tech, mode, maison, beauté et sport. Paiement Mobile Money, livraison à Libreville et dans tout le pays.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supportPhone: "+241 00 00 00 00",
  supportEmail: "support@kemdia.ga",
  locale: "fr_GA",
} as const;

/**
 * Adresse publique du site, lue AU DÉMARRAGE du serveur (variable SITE_URL), pas à la construction de l'image.
 * Indispensable pour les aperçus WhatsApp / Facebook (liens absolus) : la même image Docker sert
 * la démo (kemdia.onrender.com), le staging et la production, chacun avec sa propre adresse.
 * Valeur invalide → repli sur l'adresse inscrite à la construction.
 */
export function siteUrl(): string {
  const raw = process.env.SITE_URL;
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* valeur invalide : ignorée */
    }
  }
  return SITE.url.replace(/\/+$/, "");
}

export const INFO_PAGES = {
  "a-propos": "Qui sommes-nous ?",
  contact: "Nous contacter",
  "centre-aide": "Centre d'aide",
  livraison: "Livraison et retours",
  paiement: "Modes de paiement",
  cgv: "Conditions générales de vente",
  confidentialite: "Politique de confidentialité",
  "mentions-legales": "Mentions légales",
} as const;

export type InfoSlug = keyof typeof INFO_PAGES;
