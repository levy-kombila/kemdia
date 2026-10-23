import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { ProblemForm } from "@/components/feedback/ProblemForm";
import { pageFrom } from "@/lib/feedback/messages";
import { requireAccount } from "@/lib/orders/orders";
import { first } from "@/lib/search-params";

export const metadata: Metadata = { title: "Signaler un problème", robots: { index: false } };

/**
 * « Signaler un problème » (S8-T02, ADR-0057) : réservé aux comptes connectés (testeurs et vendeurs de la bêta).
 * `?depuis=` : page d'où vient le visiteur, réduite à son chemin.
 */
export default async function ReportProblemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = pageFrom(first(params.depuis));
  const self = `/signaler-un-probleme${page ? `?depuis=${encodeURIComponent(page)}` : ""}`;
  await requireAccount(self);

  return (
    <div className="container-page max-w-2xl space-y-4 py-4">
      <Breadcrumbs items={[{ label: "Signaler un problème" }]} />
      <h1 className="text-2xl font-bold">Signaler un problème</h1>
      <p className="text-ink-600 text-sm">
        Kemdia est en bêta : quelque chose ne marche pas, s&apos;affiche mal ou vous surprend ?
        Dites-le nous, l&apos;équipe lit chaque signalement.
      </p>
      <div className="rounded-xl bg-white p-5">
        <ProblemForm page={page} />
      </div>
    </div>
  );
}
