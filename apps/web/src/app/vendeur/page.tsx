import { ChevronRight, Clock, PackageCheck, PackagePlus, PackageX, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormAlert } from "@/components/ui/Field";
import { ShopRequestForm } from "@/components/vendor/ShopRequestForm";
import { VendorShell } from "@/components/vendor/VendorShell";
import { formatGabonPhone } from "@/lib/auth/validation";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { SHOP_STATUS } from "@/lib/vendor/labels";
import { vendorErrorFromParam, vendorNotice } from "@/lib/vendor/messages";
import { readShop, requireAccount, vendorApi } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Tableau de bord" };

/** Produits lus pour les compteurs : au-delà, « 100+ ». */
const COUNT_LIMIT = 100;

function Counter({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: typeof Store;
  label: string;
  count: string;
}) {
  return (
    <Link
      href={href}
      className="hover:ring-brand-100 flex items-center gap-4 rounded-xl bg-white p-5 transition hover:ring-4"
    >
      <span className="bg-brand-50 text-brand-700 flex size-12 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-3xl font-extrabold">{count}</span>
        <span className="text-ink-500 text-sm font-medium">{label}</span>
      </span>
      <ChevronRight className="text-ink-400 size-5" aria-hidden />
    </Link>
  );
}

/**
 * Accueil de l'espace vendeur (S6-T06) : selon la boutique du compte — pas de boutique → la demande ; demande en cours,
 * refusée ou boutique suspendue → où elle en est (et une nouvelle demande après un refus) ; boutique active → tableau
 * de bord.
 */
export default async function VendorHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [member, params] = await Promise.all([requireAccount("/vendeur"), searchParams]);
  const shop = await readShop(member, "/vendeur");
  const notice = vendorNotice(first(params.ok));
  const error = vendorErrorFromParam(first(params.erreur));

  if (!shop) {
    return (
      <VendorShell section="accueil" menu={false} title="Ouvrir ma boutique" error={error}>
        <p className="text-ink-700">
          Bonjour {member.account.firstName}, présentez votre boutique en quelques lignes.
          L&apos;équipe Kemdia examine chaque demande et vous prévient par e-mail.
        </p>
        <ShopRequestForm />
      </VendorShell>
    );
  }

  if (shop.status !== "active") {
    const status = SHOP_STATUS[shop.status];
    return (
      <VendorShell section="accueil" menu={false} title={shop.name} notice={notice} error={error}>
        <section aria-label="État de la boutique" className="space-y-3 rounded-xl bg-white p-6">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {shop.status === "pending" && (
            <p className="flex items-start gap-2">
              <Clock className="text-ink-500 mt-0.5 size-5 shrink-0" aria-hidden />
              Demande envoyée le {formatDateTime(shop.submittedAt)}. L&apos;équipe Kemdia
              l&apos;examine : vous serez prévenu par e-mail. Vous pourrez alors ajouter vos
              produits ici.
            </p>
          )}
          {shop.statusReason && (
            <p>
              <strong>Motif donné par Kemdia :</strong> {shop.statusReason}
            </p>
          )}
          {shop.status === "suspended" && (
            <p className="text-ink-700 text-sm">
              Vos produits sont cachés des clients. Contactez le service client Kemdia pour en
              savoir plus.
            </p>
          )}
          <dl className="text-ink-700 grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="font-semibold">Ville</dt>
            <dd>{shop.city}</dd>
            <dt className="font-semibold">Mobile</dt>
            <dd>{shop.phone ? formatGabonPhone(shop.phone) : "—"}</dd>
          </dl>
        </section>
        {shop.status === "rejected" && (
          <>
            <h2 className="text-lg font-extrabold">Corriger et redemander</h2>
            <ShopRequestForm
              again
              initial={{
                name: shop.name,
                city: shop.city,
                phone: shop.phone ? formatGabonPhone(shop.phone) : "",
                description: shop.description,
              }}
            />
          </>
        )}
      </VendorShell>
    );
  }

  const page = await vendorApi().products(member.token, { limit: COUNT_LIMIT });
  const count = (status: string) => {
    if (!page.ok) return "—";
    const n = page.data.items.filter((p) => p.status === status).length;
    return page.data.nextCursor ? `${n}+` : String(n);
  };

  return (
    <VendorShell section="accueil" menu title={shop.name} notice={notice} error={error}>
      <p className="text-ink-500 flex items-center gap-2 text-sm">
        <StatusBadge tone="ok">Boutique active</StatusBadge> {shop.city}
      </p>
      {!page.ok && (
        <FormAlert>
          Vos produits sont momentanément illisibles. Rechargez dans un instant.
        </FormAlert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Counter
          href="/vendeur/produits?statut=published"
          icon={PackageCheck}
          label="en ligne"
          count={count("published")}
        />
        <Counter
          href="/vendeur/produits?statut=pending"
          icon={Clock}
          label="en attente de validation"
          count={count("pending")}
        />
        <Counter
          href="/vendeur/produits?statut=rejected"
          icon={PackageX}
          label="refusés (à corriger)"
          count={count("rejected")}
        />
      </div>
      <Link
        href="/vendeur/produits/nouveau"
        className="bg-brand-600 hover:bg-brand-700 inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white"
      >
        <PackagePlus className="size-5" aria-hidden /> Ajouter un produit
      </Link>
      <p className="text-ink-500 text-sm">
        Bientôt ici : vos commandes, la vérification de votre identité et vos versements.
      </p>
    </VendorShell>
  );
}
