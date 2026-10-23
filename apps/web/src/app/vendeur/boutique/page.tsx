import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShopProfileForm } from "@/components/vendor/ShopProfileForm";
import { VendorShell } from "@/components/vendor/VendorShell";
import { requireActiveVendor } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Ma boutique" };

/**
 * « Ma boutique » (S7.5-T07, ADR-0054) : ville, quartier et description, modifiables sans nouvel examen ; lien vers la
 * page publique. Le nom et le mobile ne changent pas ici.
 */
export default async function VendorShopPage() {
  const { shop } = await requireActiveVendor("/vendeur/boutique");
  return (
    <VendorShell section="boutique" menu title="Ma boutique" crumbs={[{ label: "Ma boutique" }]}>
      <section className="space-y-2 rounded-xl bg-white p-5 text-sm">
        <p>
          <strong className="text-base">{shop.name}</strong>
        </p>
        <p className="text-ink-500">
          Le nom de la boutique ne se change pas ici : contactez l&apos;équipe Kemdia.
        </p>
        <Link
          href={`/boutique/${shop.slug}`}
          className="text-brand-700 inline-flex items-center gap-1 font-semibold underline"
        >
          Voir ma page publique <ExternalLink className="size-4" aria-hidden />
        </Link>
      </section>
      <ShopProfileForm
        initial={{
          city: shop.city,
          neighborhood: shop.neighborhood ?? "",
          description: shop.description,
        }}
      />
    </VendorShell>
  );
}
