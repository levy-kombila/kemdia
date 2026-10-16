import { ChevronRight, ImageOff, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VendorShell } from "@/components/vendor/VendorShell";
import { cn } from "@/lib/cn";
import { formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { vendorPhotoSrc } from "@/lib/vendor/images";
import { CURSOR, PRODUCT_STATUS, PRODUCT_TABS } from "@/lib/vendor/labels";
import { vendorErrorMessage, vendorNotice } from "@/lib/vendor/messages";
import { requireActiveVendor, vendorApi } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Mes produits" };

const PAGE_SIZE = 20;

/** « Mes produits » (S6-T06) : tous, ou par statut ; du plus récent au plus ancien. */
export default async function VendorProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = PRODUCT_TABS.find((s) => s === first(params.statut));
  const raw = first(params.apres);
  const after = raw && CURSOR.test(raw) ? raw : undefined;
  const { token } = await requireActiveVendor(
    status ? `/vendeur/produits?statut=${status}` : "/vendeur/produits",
  );
  const result = await vendorApi().products(token, { status, after, limit: PAGE_SIZE });

  const tabs: { id: string | undefined; label: string }[] = [
    { id: undefined, label: "Tous" },
    ...PRODUCT_TABS.map((s) => ({ id: s, label: PRODUCT_STATUS[s].tab })),
  ];

  return (
    <VendorShell
      section="produits"
      menu
      title="Mes produits"
      crumbs={[{ label: "Mes produits" }]}
      notice={vendorNotice(first(params.ok))}
    >
      <nav aria-label="Statut des produits" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {tabs.map((tab) => (
            <li key={tab.label} className="shrink-0">
              <Link
                href={tab.id ? `/vendeur/produits?statut=${tab.id}` : "/vendeur/produits"}
                aria-current={tab.id === status ? "page" : undefined}
                className={cn(
                  "inline-flex rounded-full border-2 px-4 py-1.5 text-sm font-semibold",
                  tab.id === status
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 hover:bg-ink-50 bg-white",
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!result.ok ? (
        <FormAlert>{vendorErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-12 text-center">
          <Package className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">
            {after ? "Pas d'autre produit." : "Aucun produit dans cette liste."}
          </p>
          {!status && !after && (
            <Link
              href="/vendeur/produits/nouveau"
              className="bg-brand-600 hover:bg-brand-700 rounded-full px-6 py-3 font-semibold text-white"
            >
              Ajouter mon premier produit
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {result.data.items.map((product) => {
              const cover = product.images[0]
                ? vendorPhotoSrc(product.id, product.images[0])
                : null;
              const prices = product.variants.map((v) => v.price);
              const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
              return (
                <li key={product.id}>
                  <Link
                    href={`/vendeur/produits/${product.id}`}
                    className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-3 transition hover:ring-4"
                  >
                    <span className="border-ink-100 bg-ink-50 flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                      {cover ? (
                        // Photo peut-être pas encore validée : relais de l'espace vendeur, jamais l'optimiseur (ADR-0035)
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <ImageOff className="text-ink-400 size-6" aria-label="Sans photo" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{product.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                        <StatusBadge tone={PRODUCT_STATUS[product.status].tone}>
                          {PRODUCT_STATUS[product.status].label}
                        </StatusBadge>
                        <span className="text-ink-500">
                          {prices.length > 0 && `${formatFCFA(Math.min(...prices))} · `}
                          stock {stock}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          {result.data.nextCursor && (
            <Link
              href={`/vendeur/produits?${status ? `statut=${status}&` : ""}apres=${result.data.nextCursor}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Produits suivants
            </Link>
          )}
        </>
      )}
    </VendorShell>
  );
}
