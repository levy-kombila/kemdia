import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

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
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
