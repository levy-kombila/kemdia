"use client";

import { VENDOR_PRODUCT_LIMITS } from "@kemdia/contracts/constants";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Field, FormAlert, SelectField, SubmitButton, TextAreaField } from "@/components/ui/Field";
import { createProductAction, updateContentAction } from "@/lib/vendor/actions";
import {
  checkContent,
  checkVariants,
  type ProductDraft,
  type ProductErrors,
  type VariantDraft,
} from "@/lib/vendor/forms";

/** Catégorie proposée : groupe (catégorie principale) et chemin lisible (« Mode › Pagnes »). */
export type CategoryOption = { id: string; label: string; group: string };

const L = VENDOR_PRODUCT_LIMITS;
const EMPTY_VARIANT: VariantDraft = { name: "", price: "", compareAtPrice: "", stock: "" };
const UNAVAILABLE = "Service momentanément indisponible. Réessayez dans quelques instants.";

/**
 * Fiche d'un produit (S6-T06) : création (avec ses variantes) ou modification du texte et de la catégorie. Toute
 * création ou modification envoie le produit en modération ; les prix et stocks se changent ensuite variante par
 * variante, sans nouvelle modération.
 */
export function ProductForm({
  categories,
  mode,
}: {
  categories: CategoryOption[];
  mode: { kind: "create" } | { kind: "edit"; productId: string; initial: ProductDraft };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProductDraft>(
    mode.kind === "edit" ? mode.initial : { title: "", description: "", brand: "", categoryId: "" },
  );
  const [variants, setVariants] = useState<VariantDraft[]>([{ ...EMPTY_VARIANT }]);
  const [errors, setErrors] = useState<ProductErrors>({});
  const [alert, setAlert] = useState<{ message: string; signedOut?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const create = mode.kind === "create";

  const set = (key: keyof ProductDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setVariant = (index: number, key: keyof VariantDraft) => (value: string) =>
    setVariants((list) => list.map((v, i) => (i === index ? { ...v, [key]: value } : v)));
  const focusError = () =>
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setAlert(null);
    const content = checkContent(draft);
    const checkedVariants = create ? checkVariants(variants) : { ok: true as const };
    if (!content.ok || !checkedVariants.ok) {
      setErrors({
        ...(content.ok ? {} : content.errors),
        ...(checkedVariants.ok ? {} : checkedVariants.errors),
      });
      return focusError();
    }
    setErrors({});
    setPending(true);
    if (create) {
      const result = await createProductAction({ ...draft, variants }).catch(() => null);
      if (result?.ok) {
        router.push(`/vendeur/produits/${result.id}?ok=produit-cree`);
        return;
      }
      setPending(false);
      if (!result) return setAlert({ message: UNAVAILABLE });
      if (result.errors) setErrors(result.errors as ProductErrors);
      setAlert(result);
      return focusError();
    }
    const result = await updateContentAction(mode.productId, draft).catch(() => null);
    if (result?.ok) {
      router.push(`/vendeur/produits/${mode.productId}?ok=fiche-modifiee`);
      router.refresh();
      setPending(false);
      return;
    }
    setPending(false);
    if (!result) return setAlert({ message: UNAVAILABLE });
    if (result.errors) setErrors(result.errors as ProductErrors);
    setAlert(result);
    focusError();
  };

  const groups = [...new Set(categories.map((c) => c.group))];

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
      {alert && (
        <FormAlert>
          {alert.message}{" "}
          {alert.signedOut && (
            <Link href="/connexion?retour=/vendeur/produits" className="font-semibold underline">
              Se reconnecter
            </Link>
          )}
        </FormAlert>
      )}
      {errors.form && <FormAlert>{errors.form}</FormAlert>}
      <Field
        label="Titre"
        name="title"
        maxLength={L.titleMax}
        value={draft.title}
        onChange={(e) => set("title")(e.target.value)}
        error={errors.title}
        hint="Ce que voit le client en premier : « Pagne wax 6 yards, coton »."
        required
      />
      <SelectField
        label="Catégorie"
        name="categoryId"
        value={draft.categoryId}
        onChange={(e) => set("categoryId")(e.target.value)}
        error={errors.categoryId}
        required
      >
        <option value="">Choisir une catégorie…</option>
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {categories
              .filter((c) => c.group === group)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </optgroup>
        ))}
      </SelectField>
      <Field
        label="Marque (facultatif)"
        name="brand"
        maxLength={L.brandMax}
        value={draft.brand}
        onChange={(e) => set("brand")(e.target.value)}
        error={errors.brand}
      />
      <TextAreaField
        label="Description"
        name="description"
        rows={6}
        maxLength={L.descriptionMax}
        value={draft.description}
        onChange={(e) => set("description")(e.target.value)}
        error={errors.description}
        hint={`Matière, taille, état, ce qui est inclus… ${L.descriptionMin} caractères au moins (${draft.description.trim().length} pour l'instant).`}
        required
      />

      {create && (
        <fieldset className="space-y-4">
          <legend className="text-lg font-extrabold">Variantes, prix et stock</legend>
          <p className="text-ink-500 text-sm">
            Une seule variante si le produit n&apos;existe qu&apos;en un modèle. Sinon, une par
            couleur ou taille (« Noir · L »), 20 au plus.
          </p>
          {variants.map((variant, index) => {
            const e = errors.variants?.[index];
            return (
              <div key={index} className="border-ink-200 space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Variante {index + 1}</p>
                  {variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setVariants((list) => list.filter((_, i) => i !== index))}
                      className="text-brand-700 flex items-center gap-1 text-sm font-semibold"
                    >
                      <Trash2 className="size-4" aria-hidden /> Retirer
                      <span className="sr-only"> la variante {index + 1}</span>
                    </button>
                  )}
                </div>
                <Field
                  label="Nom (couleur, taille…)"
                  name={`variant-${index}-name`}
                  maxLength={L.variantNameMax}
                  placeholder={variants.length === 1 ? "Unique" : "Noir · L"}
                  value={variant.name}
                  onChange={(ev) => setVariant(index, "name")(ev.target.value)}
                  error={e?.name}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label="Prix (FCFA)"
                    name={`variant-${index}-price`}
                    inputMode="numeric"
                    maxLength={12}
                    value={variant.price}
                    onChange={(ev) => setVariant(index, "price")(ev.target.value)}
                    error={e?.price}
                    required
                  />
                  <Field
                    label="Prix barré (facultatif)"
                    name={`variant-${index}-compareAtPrice`}
                    inputMode="numeric"
                    maxLength={12}
                    value={variant.compareAtPrice}
                    onChange={(ev) => setVariant(index, "compareAtPrice")(ev.target.value)}
                    error={e?.compareAtPrice}
                  />
                  <Field
                    label="Stock"
                    name={`variant-${index}-stock`}
                    inputMode="numeric"
                    maxLength={8}
                    value={variant.stock}
                    onChange={(ev) => setVariant(index, "stock")(ev.target.value)}
                    error={e?.stock}
                    required
                  />
                </div>
              </div>
            );
          })}
          {variants.length < L.variantsMax && (
            <button
              type="button"
              onClick={() => setVariants((list) => [...list, { ...EMPTY_VARIANT }])}
              className="border-ink-200 hover:bg-ink-50 flex items-center gap-2 rounded-full border-2 px-5 py-2.5 text-sm font-semibold"
            >
              <Plus className="size-4" aria-hidden /> Ajouter une variante
            </button>
          )}
        </fieldset>
      )}

      <SubmitButton pending={pending}>
        {create ? "Créer le produit et l'envoyer en modération" : "Enregistrer la fiche"}
      </SubmitButton>
      <p className="text-ink-500 text-sm">
        {create
          ? "Le produit reste invisible des clients jusqu'à sa validation par l'équipe Kemdia. Vous ajouterez les photos à l'étape suivante."
          : "Modifier la fiche renvoie le produit en modération : il est caché des clients en attendant."}
      </p>
    </form>
  );
}
