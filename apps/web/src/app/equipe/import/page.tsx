import type { Metadata } from "next";
import { CATALOG_IMPORT_COLUMNS } from "@kemdia/contracts/constants";
import { StaffShell } from "@/components/staff/StaffShell";
import { CatalogImportForm } from "@/components/staff/CatalogImportForm";
import { first } from "@/lib/search-params";
import { staffErrorFromParam, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff } from "@/lib/staff/staff";
import { getCategoryTree } from "@/lib/catalog";
import type { CategoryNode } from "@kemdia/contracts";

export const metadata: Metadata = { title: "Import du catalogue" };

const COLUMN_HELP: Record<(typeof CATALOG_IMPORT_COLUMNS)[number], string> = {
  boutique: "adresse de la boutique du vendeur partenaire (comme dans /boutique/…)",
  reference:
    "référence du produit chez le vendeur ; les lignes de même référence sont ses variantes",
  titre: "5 à 120 caractères",
  description: "30 à 5 000 caractères",
  marque: "facultative",
  categorie: "adresse de la catégorie (liste ci-dessous)",
  variante: "nom de la variante (« Rouge / M ») ; vide pour un produit sans variante",
  prix: "FCFA, nombre entier (« 15 000 »)",
  prix_barre: "facultatif, plus élevé que le prix",
  stock: "nombre entier",
};

/**
 * Import du vrai catalogue (S8-T03, ADR-0058), équipe Catalogue : modèle à remplir, vérification du fichier, import
 * tout ou rien. Les produits arrivent en modération ; chaque boutique ajoute ses photos.
 */
export default async function CatalogImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { account } = await requireVerifiedStaff("/equipe/import", "catalog");
  const flatten = (nodes: CategoryNode[], parent = ""): { slug: string; name: string }[] =>
    nodes.flatMap((n) => [
      { slug: n.slug, name: parent ? `${parent} › ${n.name}` : n.name },
      ...flatten(n.children, parent ? `${parent} › ${n.name}` : n.name),
    ]);
  const categories = await getCategoryTree()
    .then((tree) => flatten(tree))
    .catch(() => null);

  return (
    <StaffShell
      section="import"
      roles={account.roles}
      title="Import du catalogue"
      crumbs={[{ label: "Import du catalogue" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <section className="space-y-3 rounded-xl bg-white p-5 text-sm">
        <h2 className="font-bold">Préparer le fichier</h2>
        <p>
          Une ligne par variante, enregistrée en CSV (Excel : « CSV UTF-8 » ou « CSV séparateur
          point-virgule » ; Google Sheets : « Valeurs séparées par des virgules »). 1 000 lignes et
          2 Mo au plus.{" "}
          <a
            href="/modele-import-catalogue.csv"
            download
            className="text-brand-700 font-semibold underline"
          >
            Télécharger le modèle
          </a>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {CATALOG_IMPORT_COLUMNS.map((column) => (
            <li key={column}>
              <code>{column}</code> : {COLUMN_HELP[column]}
            </li>
          ))}
        </ul>
        <p className="text-ink-500">
          Les produits importés attendent la modération, comme ceux envoyés par un vendeur : la
          boutique ajoute ses photos, puis l&apos;équipe les valide. Une référence déjà importée
          dans la boutique est ignorée.
        </p>
      </section>

      <CatalogImportForm />

      {categories && categories.length > 0 && (
        <details className="rounded-xl bg-white p-5 text-sm">
          <summary className="cursor-pointer font-semibold">Adresses des catégories</summary>
          <ul className="mt-3 columns-1 gap-6 sm:columns-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <code>{c.slug}</code> — {c.name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </StaffShell>
  );
}
