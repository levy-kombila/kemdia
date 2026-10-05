import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Adresse lue au démarrage du serveur (SITE_URL) : rendu à la demande
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/panier",
        "/compte",
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
