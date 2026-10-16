import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Adresse lue au démarrage du serveur (SITE_URL) : rendu à la demande
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // Démo (données fictives, pages envoyées en streaming : une page introuvable y répond 200) : jamais indexée
  if (process.env.APP_ENV === "demo") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/panier",
        "/compte",
        "/vendeur",
        "/recherche",
        "/connexion",
        "/inscription",
        "/mot-de-passe-oublie",
        "/commande",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
