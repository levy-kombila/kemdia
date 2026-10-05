import type { MetadataRoute } from "next";
import { getAllCategorySlugs, getAllProductSlugs } from "@/lib/catalog";
import { INFO_PAGES, siteUrl } from "@/lib/site";

// Adresse lue au démarrage du serveur (SITE_URL) : rendu à la demande
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${siteUrl()}${path}`;
  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/promotions"), changeFrequency: "daily", priority: 0.8 },
    { url: url("/categories"), changeFrequency: "weekly", priority: 0.6 },
    ...getAllCategorySlugs().map((s) => ({
      url: url(`/categorie/${s}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...getAllProductSlugs().map((s) => ({
      url: url(`/produit/${s}`),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...Object.keys(INFO_PAGES).map((s) => ({
      url: url(`/infos/${s}`),
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
