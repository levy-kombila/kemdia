import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";

/**
 * Fiches vues par le module `reviews` (S8-T01, ADR-0056) : fiche publiée par son adresse et ses offres (pour vérifier
 * l'achat), titres pour la file de l'équipe, et la note moyenne / le nombre d'avis publiés, écrits dans la transaction
 * en cours (avec l'avis qui les change).
 */
@Injectable()
export class ListingRatings {
  constructor(private readonly tx: TransactionContext) {}

  async findPublished(
    slug: string,
  ): Promise<{ listingId: string; title: string; offerIds: string[] } | null> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return null;
    const row = await this.tx.db.listing.findFirst({
      where: { slug, status: "PUBLISHED", mergedIntoId: null },
      select: { id: true, title: true, offers: { select: { id: true } } },
    });
    return row
      ? { listingId: row.id, title: row.title, offerIds: row.offers.map((o) => o.id) }
      : null;
  }

  /**
   * Fiche par son adresse quel que soit son état (en suivant une fusion) : pour voir ou retirer son avis même si la
   * fiche n'est plus en ligne (relecture de sécurité S8-T01). `published` : en ligne et non fusionnée.
   */
  async findAny(slug: string): Promise<{ listingId: string; published: boolean } | null> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return null;
    let row = await this.tx.db.listing.findUnique({
      where: { slug },
      select: { id: true, status: true, mergedIntoId: true },
    });
    // Une seule étape de fusion suffit : une fiche cible n'est jamais elle-même fusionnée (catalog)
    if (row?.mergedIntoId) {
      row = await this.tx.db.listing.findUnique({
        where: { id: row.mergedIntoId },
        select: { id: true, status: true, mergedIntoId: true },
      });
    }
    return row
      ? { listingId: row.id, published: row.status === "PUBLISHED" && row.mergedIntoId === null }
      : null;
  }

  /**
   * Verrouille la fiche jusqu'à la fin de la transaction : deux changements d'avis simultanés sur la même fiche
   * s'attendent, et le second recalcule la note en voyant le premier (relecture de sécurité S8-T01).
   */
  async lock(listingId: string): Promise<void> {
    await this.tx.db.$queryRaw`
      SELECT "id" FROM "catalog"."listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
  }

  async describe(
    listingIds: readonly string[],
  ): Promise<Map<string, { title: string; slug: string }>> {
    if (!listingIds.length) return new Map();
    const rows = await this.tx.db.listing.findMany({
      where: { id: { in: [...listingIds] } },
      select: { id: true, title: true, slug: true },
    });
    return new Map(rows.map((r) => [r.id, { title: r.title, slug: r.slug }]));
  }

  async setRating(listingId: string, average: number, count: number): Promise<void> {
    await this.tx.db.listing.update({
      where: { id: listingId },
      data: { rating: average, reviewCount: count },
    });
  }
}
