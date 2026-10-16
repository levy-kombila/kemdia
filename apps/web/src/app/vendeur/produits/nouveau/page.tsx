import type { Metadata } from "next";
import { FormAlert } from "@/components/ui/Field";
import { ProductForm } from "@/components/vendor/ProductForm";
import { VendorShell } from "@/components/vendor/VendorShell";
import { getCategoryTree } from "@/lib/catalog";
import { categoryOptions } from "@/lib/vendor/categories";
import { requireActiveVendor } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Ajouter un produit" };

/** Nouveau produit (S6-T06) : fiche et variantes ; les photos s'ajoutent juste après, sur la page du produit. */
export default async function NewProductPage() {
  await requireActiveVendor("/vendeur/produits/nouveau");
  const tree = await getCategoryTree().catch(() => []);
  return (
    <VendorShell
      section="nouveau"
      menu
      title="Ajouter un produit"
      crumbs={[{ label: "Mes produits", href: "/vendeur/produits" }, { label: "Nouveau" }]}
    >
      {tree.length === 0 ? (
        <FormAlert>Catégories momentanément indisponibles. Rechargez dans un instant.</FormAlert>
      ) : (
        <div className="rounded-xl bg-white p-6">
          <ProductForm categories={categoryOptions(tree)} mode={{ kind: "create" }} />
        </div>
      )}
    </VendorShell>
  );
}
