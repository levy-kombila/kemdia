import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type { Page, PublicShop, PublicShops } from "../application/ports.js";

type SellerRow = {
  shop_id: string;
  name: string;
  slug: string;
  city: string;
  neighborhood: string | null;
  description: string;
  official: boolean;
  active: boolean;
  since: Date;
};

/**
 * Annuaire et pages publiques des boutiques (S7.5-T07, ADR-0054), lus dans la copie du catalogue (`catalog.sellers`) :
 * le catalogue ne lit jamais les tables du module vendors. Seules les boutiques actives sortent. Requêtes paramétrées.
 */
@Injectable()
export class PrismaPublicShopsRepository implements PublicShops {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    city?: string;
    neighborhood?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<PublicShop>> {
    const cityFilter = query.city ? Prisma.sql`AND s."city" = ${query.city}` : Prisma.empty;
    const counted = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM "catalog"."sellers" s WHERE s."active" ${cityFilter}`;
    const total = counted[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, totalPages);
    // Boutique officielle d'abord, puis celles du quartier du client, puis par nom (l'identifiant départage)
    const nearFirst = query.neighborhood
      ? Prisma.sql`(s."neighborhood" IS NOT DISTINCT FROM ${query.neighborhood}) DESC,`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<SellerRow[]>`
      SELECT s."shop_id", s."name", s."slug", s."city", s."neighborhood", s."description", s."official",
             s."active", s."since"
      FROM "catalog"."sellers" s
      WHERE s."active" ${cityFilter}
      ORDER BY s."official" DESC, ${nearFirst} lower(s."name"), s."shop_id"
      LIMIT ${query.pageSize} OFFSET ${(page - 1) * query.pageSize}`;
    return {
      items: await this.withCounts(rows),
      page,
      pageSize: query.pageSize,
      total,
      totalPages,
    };
  }

  async findActiveBySlug(slug: string): Promise<PublicShop | null> {
    const rows = await this.prisma.$queryRaw<SellerRow[]>`
      SELECT s."shop_id", s."name", s."slug", s."city", s."neighborhood", s."description", s."official",
             s."active", s."since"
      FROM "catalog"."sellers" s
      WHERE s."slug" = ${slug} AND s."active"`;
    return (await this.withCounts(rows))[0] ?? null;
  }

  /** Nombre de fiches visibles (publiées, non fusionnées) où chaque boutique a une offre visible. */
  private async withCounts(rows: readonly SellerRow[]): Promise<PublicShop[]> {
    if (!rows.length) return [];
    const counts = await this.prisma.$queryRaw<{ shop_id: string; n: number }[]>`
      SELECT p."shop_id", count(DISTINCT p."listing_id")::int AS n
      FROM "catalog"."products" p
      JOIN "catalog"."listings" l ON l."id" = p."listing_id"
      WHERE p."shop_id" = ANY(${rows.map((r) => r.shop_id)}::uuid[])
        AND p."status" = 'PUBLISHED' AND NOT p."shop_suspended"
        AND l."status" = 'PUBLISHED' AND l."merged_into_id" IS NULL
      GROUP BY p."shop_id"`;
    const byShop = new Map(counts.map((c) => [c.shop_id, c.n]));
    return rows.map((r) => ({
      shopId: r.shop_id,
      name: r.name,
      slug: r.slug,
      city: r.city,
      neighborhood: r.neighborhood,
      description: r.description,
      official: r.official,
      active: r.active,
      since: r.since,
      productCount: byShop.get(r.shop_id) ?? 0,
    }));
  }
}
