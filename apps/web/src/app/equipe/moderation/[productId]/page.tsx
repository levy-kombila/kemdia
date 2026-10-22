import { VENDOR_PRODUCT_LIMITS } from "@kemdia/contracts/constants";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproveForm, ReasonForm } from "@/components/staff/DecisionForms";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { getCategoryTree } from "@/lib/catalog";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { decideProductAction } from "@/lib/staff/actions";
import { PRODUCT_STATUS, SHOP_STATUS } from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage } from "@/lib/staff/messages";
import { categoryPathOf, staffImageSrc } from "@/lib/staff/moderation-view";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Produit à modérer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Un produit vu par la modération (S6-T02 et T04) : photos, texte, catégorie, variantes. La décision porte sur CETTE
 * version (`submittedAt` lu) : si le vendeur renvoie le produit entre-temps, l'API refuse (`PRODUIT_MODIFIE`).
 */
export default async function ModerationProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(productId)) notFound();
  const { account, token } = await requireVerifiedStaff(
    `/equipe/moderation/${productId}`,
    "catalog",
  );
  const [result, tree] = await Promise.all([
    staffApi().moderationProduct(token, productId),
    getCategoryTree().catch(() => []),
  ]);
  if (!result.ok && result.code === "PRODUIT_INTROUVABLE") notFound();

  const crumbs = [{ label: "Modération", href: "/equipe/moderation" }, { label: "Produit" }];
  if (!result.ok) {
    return (
      <StaffShell
        section="moderation"
        roles={account.roles}
        title="Produit à modérer"
        crumbs={crumbs}
      >
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      </StaffShell>
    );
  }

  const product = result.data;
  const photos = product.images
    .map((path) => staffImageSrc(product.id, path))
    .filter((src): src is string => src !== null);
  const category = categoryPathOf(tree, product.categoryId);
  const decidable = product.status === "pending" && product.submittedAt !== null;
  const hidden = { productId: product.id, submittedAt: product.submittedAt ?? "" };
  const L = VENDOR_PRODUCT_LIMITS;

  return (
    <StaffShell
      section="moderation"
      roles={account.roles}
      title={product.title}
      crumbs={crumbs}
      error={staffErrorFromParam(first(query.erreur))}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={PRODUCT_STATUS[product.status].tone}>
          {PRODUCT_STATUS[product.status].label}
        </StatusBadge>
        {product.shop && (
          <span>
            Boutique <strong>{product.shop.name}</strong>
            {product.shop.status !== "active" && (
              <>
                {" "}
                <StatusBadge tone={SHOP_STATUS[product.shop.status].tone}>
                  {SHOP_STATUS[product.shop.status].label}
                </StatusBadge>
              </>
            )}
            <>
              {" · "}
              <Link
                href={`/equipe/boutiques/${product.shop.id}`}
                className="text-brand-700 font-semibold underline"
              >
                voir la boutique
              </Link>
            </>
          </span>
        )}
        {product.submittedAt && (
          <span className="text-ink-500">· envoyé le {formatDateTime(product.submittedAt)}</span>
        )}
      </div>

      <section aria-labelledby="photos" className="rounded-xl bg-white p-4 sm:p-6">
        <h2 id="photos" className="mb-3 text-lg font-extrabold">
          Photos ({photos.length})
        </h2>
        {photos.length === 0 ? (
          <p className="text-ink-500 text-sm">Aucune photo.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((src, index) => (
              <li key={src}>
                <a href={src} target="_blank" rel="noopener" className="block">
                  {/* Photo pas encore validée : relais de l'équipe, jamais l'optimiseur de Next.js (ADR-0035) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Photo ${index + 1}${index === 0 ? " (principale)" : ""}`}
                    loading="lazy"
                    className="border-ink-100 bg-ink-50 aspect-square w-full rounded-lg border object-contain"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="texte" className="space-y-3 rounded-xl bg-white p-4 sm:p-6">
        <h2 id="texte" className="text-lg font-extrabold">
          Fiche
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-ink-500 font-semibold">Catégorie</dt>
          <dd>{category ?? "Catégorie inconnue"}</dd>
          <dt className="text-ink-500 font-semibold">Marque</dt>
          <dd>{product.brand ?? "Sans marque"}</dd>
        </dl>
        <p className="whitespace-pre-line break-words text-base">{product.description}</p>
      </section>

      <section aria-labelledby="variantes" className="rounded-xl bg-white p-4 sm:p-6">
        <h2 id="variantes" className="mb-3 text-lg font-extrabold">
          Variantes ({product.variants.length})
        </h2>
        {/* Région défilante sur téléphone : atteignable au clavier (WCAG 2.1.1) */}
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Tableau des variantes"
        >
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-ink-500">
              <tr>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Variante
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Prix
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Stock
                </th>
                <th scope="col" className="py-2 font-semibold">
                  En vente
                </th>
              </tr>
            </thead>
            <tbody className="divide-ink-100 divide-y">
              {product.variants.map((variant) => (
                <tr key={variant.id}>
                  <td className="py-2 pr-3">
                    <span className="font-semibold">{variant.name}</span>
                    {Object.keys(variant.attributes).length > 0 && (
                      <span className="text-ink-500 block text-xs">
                        {Object.entries(variant.attributes)
                          .map(([key, value]) => `${key} : ${value}`)
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {formatFCFA(variant.price)}
                    {variant.compareAtPrice !== null && (
                      <span className="text-ink-500 ml-1 line-through">
                        {formatFCFA(variant.compareAtPrice)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{variant.stock}</td>
                  <td className="py-2">{variant.isActive ? "Oui" : "Non"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {product.moderationReason && (
        <FormAlert tone="info">Motif du dernier refus : {product.moderationReason}</FormAlert>
      )}

      {decidable ? (
        <section aria-label="Décision" className="space-y-3">
          <ApproveForm action={decideProductAction} hidden={hidden}>
            Valider et mettre en ligne
          </ApproveForm>
          <ReasonForm
            action={decideProductAction}
            hidden={hidden}
            decision="reject"
            label="Motif du refus"
            button="Refuser le produit"
            min={L.reasonMin}
            max={L.reasonMax}
          />
        </section>
      ) : (
        <p className="text-ink-500 text-sm">Ce produit n&apos;attend pas de décision.</p>
      )}
    </StaffShell>
  );
}
