import { ChevronRight, Package } from "lucide-react";
import type { Metadata } from "next";
import { ProductImage } from "@/components/ui/ProductImage";
import Link from "next/link";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { FormAlert } from "@/components/ui/Field";
import { formatDate, formatFCFA } from "@/lib/format";
import { isOrderCursor } from "@/lib/orders/api-orders";
import { orderMessage } from "@/lib/orders/order-messages";
import { ordersApi, requireAccount, sessionToken } from "@/lib/orders/orders";
import { first } from "@/lib/search-params";

export const metadata: Metadata = { title: "Mes commandes", robots: { index: false } };

/** « Mes commandes » (S5-T07) : les commandes du compte, de la plus récente à la plus ancienne, 10 par page. */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccount("/compte/commandes");
  const params = await searchParams;
  const raw = first(params.avant);
  const before = isOrderCursor(raw) ? raw : undefined;
  const token = (await sessionToken())!;
  const result = await ordersApi().list(token, before);

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Mon compte", href: "/compte" }, { label: "Mes commandes" }]} />
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Mes commandes</h1>
        {!result.ok ? (
          <FormAlert>{orderMessage(result.code)}</FormAlert>
        ) : result.data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-14 text-center">
            <Package className="text-ink-400 size-12" aria-hidden />
            <p className="font-semibold">
              {before ? "Aucune commande plus ancienne." : "Vous n'avez pas encore de commande."}
            </p>
            <Link
              href="/"
              className="bg-brand-600 hover:bg-brand-700 mt-2 rounded-full px-6 py-3 font-semibold text-white"
            >
              Découvrir les produits
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {result.data.items.map((order) => (
                <li key={order.reference}>
                  <Link
                    href={`/compte/commandes/${order.reference}`}
                    className="hover:ring-brand-100 flex items-center gap-3 rounded-xl bg-white p-4 transition hover:ring-4"
                  >
                    <span className="border-ink-100 relative size-14 shrink-0 overflow-hidden rounded-lg border bg-white">
                      {order.image && (
                        <ProductImage
                          src={order.image}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-contain p-1"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-price block font-bold tracking-wide">
                        {order.reference}
                      </span>
                      <span className="text-ink-500 block text-sm">
                        {formatDate(order.createdAt)} · {order.itemCount} article
                        {order.itemCount > 1 ? "s" : ""}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <OrderStatusBadge status={order.status} />
                        <span className="text-sm font-semibold">{formatFCFA(order.total)}</span>
                      </span>
                    </span>
                    <ChevronRight className="text-ink-400 size-5 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <nav aria-label="Pages de commandes" className="flex justify-between gap-3">
              {before ? (
                <Link
                  href="/compte/commandes"
                  className="text-brand-700 text-sm font-semibold underline"
                >
                  Commandes les plus récentes
                </Link>
              ) : (
                <span />
              )}
              {result.data.nextCursor && (
                <Link
                  href={`/compte/commandes?avant=${encodeURIComponent(result.data.nextCursor)}`}
                  className="text-brand-700 text-sm font-semibold underline"
                >
                  Commandes plus anciennes
                </Link>
              )}
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
