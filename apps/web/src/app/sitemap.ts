import type { MetadataRoute } from "next";
import { getSitemapSlugs } from "@/lib/catalog";
import { INFO_PAGES, siteUrl } from "@/lib/site";

// Adresse lue au démarrage du serveur (SITE_URL) : rendu à la demande
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (path: string) => `${siteUrl()}${path}`;
  const slugs = await getSitemapSlugs();
  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/promotions"), changeFrequency: "daily", priority: 0.8 },
    { url: url("/categories"), changeFrequency: "weekly", priority: 0.6 },
    { url: url("/vendre"), changeFrequency: "monthly", priority: 0.5 },
    ...slugs.categories.map((s) => ({
      url: url(`/categorie/${s}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...slugs.products.map((s) => ({
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
