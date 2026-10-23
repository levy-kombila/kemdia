import { CITIES, OTHER_NEIGHBORHOOD } from "@kemdia/contracts/delivery";
import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CITY_COOKIE } from "@/components/providers/LocationProvider";
import { ShopCard } from "@/components/shops/ShopCard";
import { getShops } from "@/lib/catalog";
import { first } from "@/lib/search-params";
import { parseShopFilters, shopsHref } from "@/lib/shops";

export const metadata: Metadata = {
  title: "Boutiques",
  description: "Les boutiques qui vendent sur Kemdia, près de chez vous.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const selectClass =
  "border-ink-200 focus:border-brand-500 h-11 w-full rounded-full border bg-white px-4 text-sm focus:outline-none";

/**
 * Annuaire des boutiques (S7.5-T07, ADR-0054). « Près de chez moi » sans GPS : la ville de livraison choisie
 * (cookie), puis le quartier choisi ici ; les boutiques du quartier d'abord (la boutique officielle reste en tête).
 * Simple formulaire GET : fonctionne sans JavaScript (le quartier apparaît une fois la ville choisie).
 */
export default async function ShopsPage({ searchParams }: Props) {
  const [sp, jar] = await Promise.all([searchParams, cookies()]);
  const filters = parseShopFilters(
    { ville: first(sp.ville), quartier: first(sp.quartier), page: first(sp.page) },
    jar.get(CITY_COOKIE)?.value,
  );
  const result = await getShops(filters);
  const city = CITIES.find((c) => c.name === filters.city);

  return (
    <div className="container-page space-y-3 py-4">
      <Breadcrumbs items={[{ label: "Boutiques" }]} />
      <header className="space-y-3 rounded-xl bg-white px-5 py-4">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Boutiques près de chez moi</h1>
        <form action="/boutiques" method="get" className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="sr-only" htmlFor="shops-city">
            Ville
          </label>
          <select
            id="shops-city"
            name="ville"
            defaultValue={filters.city ?? ""}
            className={selectClass}
          >
            <option value="">Toutes les villes</option>
            {CITIES.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {city && (
            <>
              <label className="sr-only" htmlFor="shops-quarter">
                Mon quartier
              </label>
              <select
                id="shops-quarter"
                name="quartier"
                defaultValue={filters.neighborhood ?? ""}
                className={selectClass}
              >
                <option value="">Mon quartier : {OTHER_NEIGHBORHOOD.toLowerCase()}</option>
                {city.neighborhoods.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white"
          >
            <MapPin className="size-4" aria-hidden /> Afficher
          </button>
        </form>
        <p className="text-ink-500 text-sm" role="status">
          {result.total} boutique{result.total > 1 ? "s" : ""}
          {filters.city ? ` à ${filters.city}` : ""}
          {filters.neighborhood ? ` — celles de ${filters.neighborhood} d'abord` : ""}
        </p>
      </header>

      {result.items.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((shop) => (
            <li key={shop.slug}>
              <ShopCard shop={shop} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-500 rounded-xl bg-white px-5 py-10 text-center">
          Aucune boutique {filters.city ? `à ${filters.city} ` : ""}pour l&apos;instant.{" "}
          <Link href={shopsHref({ page: 1 })} className="text-brand-700 underline">
            Voir toutes les villes
          </Link>
        </p>
      )}

      {result.totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-2">
          {result.page > 1 && (
            <Link
              href={shopsHref({ ...filters, page: result.page - 1 })}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold"
            >
              Précédente
            </Link>
          )}
          <span className="text-ink-500 text-sm">
            Page {result.page} sur {result.totalPages}
          </span>
          {result.page < result.totalPages && (
            <Link
              href={shopsHref({ ...filters, page: result.page + 1 })}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold"
            >
              Suivante
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
