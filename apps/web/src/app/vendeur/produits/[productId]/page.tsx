import { ExternalLink, Star, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PhotoUploader } from "@/components/vendor/PhotoUploader";
import { ProductForm } from "@/components/vendor/ProductForm";
import { VendorShell } from "@/components/vendor/VendorShell";
import { getCategoryTree } from "@/lib/catalog";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import {
  addOfferVariantAction,
  archiveProductAction,
  mainPhotoAction,
  proposeCorrectionAction,
  removePhotoAction,
  restoreProductAction,
  updateVariantAction,
} from "@/lib/vendor/actions";
import { categoryLabel, categoryOptions } from "@/lib/vendor/categories";
import { MAX_PHOTOS, isUuid, photoIdOf, vendorPhotoSrc } from "@/lib/vendor/images";
import { PRODUCT_STATUS } from "@/lib/vendor/labels";
import { vendorErrorFromParam, vendorErrorMessage, vendorNotice } from "@/lib/vendor/messages";
import { requireActiveVendor, vendorApi } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Produit" };

const inputClass =
  "border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-3 py-2.5 text-base outline-none focus:ring-4";
const secondaryButton =
  "border-ink-200 hover:bg-ink-50 inline-flex items-center gap-1.5 rounded-full border-2 bg-white px-4 py-2 text-sm font-semibold";

/**
 * Un produit du vendeur (S6-T06) : état de la modération, photos (ajout, principale, retrait), prix et stock par
 * variante (sans nouvelle modération), fiche (avec nouvelle modération), retrait de la vente ou remise en vente.
 * Les modifications sont de simples formulaires vers des actions serveur, sauf la fiche et l'envoi des photos.
 */
export default async function VendorProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(productId) || productId !== productId.toLowerCase()) notFound();
  const { token } = await requireActiveVendor(`/vendeur/produits/${productId}`);
  const [result, tree] = await Promise.all([
    vendorApi().product(token, productId),
    getCategoryTree().catch(() => []),
  ]);
  if (!result.ok && result.code === "PRODUIT_INTROUVABLE") notFound();

  const crumbs = [{ label: "Mes produits", href: "/vendeur/produits" }, { label: "Produit" }];
  if (!result.ok) {
    return (
      <VendorShell section="produits" menu title="Produit" crumbs={crumbs}>
        <FormAlert>{vendorErrorMessage(result.code)}</FormAlert>
      </VendorShell>
    );
  }

  const product = result.data;
  const status = PRODUCT_STATUS[product.status];
  const archived = product.status === "archived";
  // S7.5-T02 : la boutique écrit le contenu seulement sur SA fiche pas encore en ligne ; ensuite, l'équipe la corrige
  const editable = product.listing.editable;
  const listingOnline = product.listing.status === "published";
  // Offre retirée par l'équipe sur une fiche en ligne : elle revient seulement après modération
  const withdrawn = listingOnline && product.status === "rejected";
  const missingVariants = product.listing.variants.filter(
    (v) => !product.variants.some((own) => own.listingVariantId === v.id),
  );
  const hidden = <input type="hidden" name="productId" value={product.id} />;
  const photos = product.images
    .map((path) => ({ id: photoIdOf(path), src: vendorPhotoSrc(product.id, path) }))
    .filter((p): p is { id: string; src: string } => p.id !== null && p.src !== null);

  return (
    <VendorShell
      section="produits"
      menu
      title={product.title}
      crumbs={crumbs}
      notice={vendorNotice(first(query.ok))}
      error={vendorErrorFromParam(first(query.erreur))}
    >
      <section aria-label="État du produit" className="space-y-2 rounded-xl bg-white p-5">
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <span className="text-ink-500 text-sm">
            {product.visible ? "Visible des clients" : "Invisible des clients"}
          </span>
        </p>
        {product.status === "pending" && (
          <p className="text-ink-700 text-sm">
            L&apos;équipe Kemdia vérifie ce produit
            {product.submittedAt ? ` (envoyé le ${formatDateTime(product.submittedAt)})` : ""}. Il
            sera visible dès sa validation.
          </p>
        )}
        {product.status === "rejected" && product.moderationReason && (
          <FormAlert>
            <strong>{withdrawn ? "Offre retirée par l'équipe" : "Motif du refus"} :</strong>{" "}
            {product.moderationReason}.{" "}
            {withdrawn
              ? "Demandez sa remise en vente : l'équipe la vérifiera."
              : "Corrigez la fiche ou les photos : le produit repartira en modération."}
          </FormAlert>
        )}
        {!editable && listingOnline && (
          <p className="text-ink-700 text-sm">
            Fiche commune en ligne : le titre, la description et les photos sont les mêmes pour
            toutes les boutiques qui vendent ce produit. Seule l&apos;équipe Kemdia les modifie.
          </p>
        )}
        {product.visible && (
          <Link
            href={`/produit/${product.listing.slug}`}
            className="text-brand-700 inline-flex items-center gap-1 text-sm font-semibold underline"
          >
            Voir la page du produit <ExternalLink className="size-4" aria-hidden />
          </Link>
        )}
      </section>

      {!editable && (
        <section aria-labelledby="photos" className="space-y-4 rounded-xl bg-white p-5">
          <h2 id="photos" className="text-lg font-extrabold">
            Photos de la fiche ({product.images.length})
          </h2>
          {product.images.length === 0 ? (
            <p className="text-ink-500 text-sm">Aucune photo sur cette fiche.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {product.images.map((src, index) => (
                <li key={src}>
                  {/* Photos d'une fiche en ligne : publiques, servies par le relais du site (ADR-0035) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Photo ${index + 1}${index === 0 ? " (principale)" : ""}`}
                    loading="lazy"
                    className="border-ink-100 bg-ink-50 aspect-square w-full rounded-lg border object-contain"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editable && (
        <section aria-labelledby="photos" className="space-y-4 rounded-xl bg-white p-5">
          <h2 id="photos" className="text-lg font-extrabold">
            Photos ({photos.length}/{MAX_PHOTOS})
          </h2>
          {photos.length === 0 ? (
            <p className="text-ink-500 text-sm">
              Aucune photo : un produit avec de bonnes photos se vend bien mieux.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo, index) => (
                <li key={photo.id} className="space-y-2">
                  {/* Relais de l'espace vendeur (photo peut-être pas encore validée), jamais l'optimiseur (ADR-0035) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    alt={`Photo ${index + 1}${index === 0 ? " (principale)" : ""}`}
                    loading="lazy"
                    className="border-ink-100 bg-ink-50 aspect-square w-full rounded-lg border object-contain"
                  />
                  {index === 0 ? (
                    <p className="text-forest-700 flex items-center gap-1 text-xs font-bold">
                      <Star className="size-4" aria-hidden /> Photo principale
                    </p>
                  ) : (
                    <form action={mainPhotoAction}>
                      {hidden}
                      <input type="hidden" name="imageId" value={photo.id} />
                      <button type="submit" className={secondaryButton}>
                        <Star className="size-4" aria-hidden /> Principale
                        <span className="sr-only"> : photo {index + 1}</span>
                      </button>
                    </form>
                  )}
                  {/* Retrait définitif : replié, comme le retrait de la vente (pas de clic distrait) */}
                  <details>
                    <summary className="text-brand-700 flex cursor-pointer items-center gap-1 text-sm font-semibold">
                      <Trash2 className="size-4" aria-hidden /> Retirer…
                      <span className="sr-only"> la photo {index + 1}</span>
                    </summary>
                    <form action={removePhotoAction} className="mt-2">
                      {hidden}
                      <input type="hidden" name="imageId" value={photo.id} />
                      <button type="submit" className={`${secondaryButton} text-brand-700`}>
                        Retirer définitivement
                        <span className="sr-only"> la photo {index + 1}</span>
                      </button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {!archived && (
            <PhotoUploader productId={product.id} remaining={MAX_PHOTOS - photos.length} />
          )}
          <p className="text-ink-500 text-sm">
            Ajouter une photo renvoie le produit en modération. Changer la photo principale ou en
            retirer une : sans modération.
          </p>
        </section>
      )}

      <section aria-labelledby="variantes" className="space-y-4 rounded-xl bg-white p-5">
        <h2 id="variantes" className="text-lg font-extrabold">
          Prix et stock
        </h2>
        <p className="text-ink-500 text-sm">Enregistré tout de suite, sans nouvelle modération.</p>
        {product.variants.map((variant) => (
          <form
            key={variant.id}
            action={updateVariantAction}
            className="border-ink-200 space-y-3 rounded-xl border p-4"
          >
            {hidden}
            <input type="hidden" name="variantId" value={variant.id} />
            <input type="hidden" name="previousStock" value={variant.stock} />
            <p className="font-semibold">
              {variant.name}{" "}
              <span className="text-ink-500 text-xs font-normal">réf. {variant.sku}</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold">
                Prix (FCFA)
                <input
                  name="price"
                  inputMode="numeric"
                  required
                  maxLength={12}
                  defaultValue={variant.price}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-sm font-semibold">
                Prix barré (facultatif)
                <input
                  name="compareAtPrice"
                  inputMode="numeric"
                  maxLength={12}
                  defaultValue={variant.compareAtPrice ?? ""}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-sm font-semibold">
                Stock
                <input
                  name="stock"
                  inputMode="numeric"
                  required
                  maxLength={8}
                  defaultValue={variant.stock}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={variant.isActive}
                  className="accent-brand-600 size-5"
                />
                En vente
              </label>
              <button
                type="submit"
                className="bg-ink-900 hover:bg-ink-800 rounded-full px-5 py-2 text-sm font-semibold text-white"
              >
                Enregistrer
                <span className="sr-only"> : {variant.name}</span>
              </button>
            </div>
            <p className="text-ink-500 text-xs">
              Prix actuel {formatFCFA(variant.price)} · stock {variant.stock}
            </p>
          </form>
        ))}
        {listingOnline && !archived && !withdrawn && missingVariants.length > 0 && (
          <details className="border-ink-200 rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">
              Vendre une autre déclinaison de ce produit
            </summary>
            <form action={addOfferVariantAction} className="mt-3 space-y-3">
              {hidden}
              <label className="block text-sm font-semibold">
                Déclinaison
                <select name="listingVariantId" required className={`${inputClass} mt-1`}>
                  {missingVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-semibold">
                  Prix (FCFA)
                  <input
                    name="price"
                    inputMode="numeric"
                    required
                    maxLength={12}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Prix barré (facultatif)
                  <input
                    name="compareAtPrice"
                    inputMode="numeric"
                    maxLength={12}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Stock
                  <input
                    name="stock"
                    inputMode="numeric"
                    required
                    maxLength={8}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              </div>
              <button
                type="submit"
                className="bg-ink-900 hover:bg-ink-800 rounded-full px-5 py-2 text-sm font-semibold text-white"
              >
                Ajouter à mon offre
              </button>
            </form>
          </details>
        )}
      </section>

      {!editable && listingOnline && product.status === "published" && (
        <details className="rounded-xl bg-white">
          <summary className="cursor-pointer px-5 py-4 text-lg font-extrabold">
            Proposer une correction de la fiche
          </summary>
          <form action={proposeCorrectionAction} className="space-y-3 px-5 pb-5">
            {hidden}
            <label className="block text-sm font-semibold">
              Ce qu&apos;il faut corriger (titre, description, photo, déclinaison manquante…)
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={500}
                rows={4}
                className={`${inputClass} mt-1`}
              />
            </label>
            <button
              type="submit"
              className="bg-ink-900 hover:bg-ink-800 rounded-full px-5 py-2 text-sm font-semibold text-white"
            >
              Envoyer à l&apos;équipe Kemdia
            </button>
            <p className="text-ink-500 text-xs">
              10 à 500 caractères. L&apos;équipe corrige la fiche pour toutes les boutiques.
            </p>
          </form>
        </details>
      )}

      {!archived && editable && (
        <details className="group rounded-xl bg-white">
          <summary className="cursor-pointer px-5 py-4 text-lg font-extrabold">
            Modifier la fiche (titre, description, catégorie)
          </summary>
          <div className="px-5 pb-5">
            {tree.length === 0 ? (
              <FormAlert>Catégories momentanément indisponibles.</FormAlert>
            ) : (
              <ProductForm
                categories={categoryOptions(tree)}
                mode={{
                  kind: "edit",
                  productId: product.id,
                  initial: {
                    title: product.title,
                    description: product.description,
                    brand: product.brand ?? "",
                    categoryId: product.categoryId,
                  },
                }}
              />
            )}
          </div>
        </details>
      )}
      {archived && (
        <p className="text-ink-500 text-sm">
          Catégorie : {categoryLabel(tree, product.categoryId) ?? "—"}
        </p>
      )}

      <section aria-label="Vente" className="rounded-xl bg-white p-5">
        {archived || withdrawn ? (
          <form action={restoreProductAction} className="space-y-2">
            {hidden}
            <p className="text-ink-700 text-sm">
              {withdrawn
                ? "Votre offre repassera par la vérification de l'équipe Kemdia."
                : listingOnline
                  ? "Votre offre revient en ligne tout de suite."
                  : "Remettre en vente renvoie le produit en modération."}
            </p>
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 rounded-full px-5 py-2.5 font-semibold text-white"
            >
              {withdrawn ? "Demander la remise en vente" : "Remettre en vente"}
            </button>
          </form>
        ) : listingOnline && product.status !== "published" ? (
          <p className="text-ink-500 text-sm">
            Offre en cours de vérification par l&apos;équipe Kemdia.
          </p>
        ) : (
          <details>
            <summary className="text-brand-700 cursor-pointer font-semibold">
              Retirer ce produit de la vente…
            </summary>
            <form action={archiveProductAction} className="mt-3 space-y-2">
              {hidden}
              <p className="text-ink-700 text-sm">
                Il disparaît du site tout de suite. Il n&apos;est jamais effacé (il peut figurer
                dans des commandes) et vous pourrez le remettre en vente.
              </p>
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 rounded-full px-5 py-2.5 font-semibold text-white"
              >
                Retirer de la vente
              </button>
            </form>
          </details>
        )}
      </section>
    </VendorShell>
  );
}
