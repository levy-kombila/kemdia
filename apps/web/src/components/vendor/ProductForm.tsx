"use client";

import { VENDOR_PRODUCT_LIMITS } from "@kemdia/contracts/constants";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { reduce, sendPhoto } from "@/components/vendor/PhotoUploader";
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
const MAX_PHOTOS = 10;

/** Photo choisie avant la création (S7.5-T03, « photo d'abord ») : déjà réduite, envoyée juste après la création. */
type PendingPhoto = { blob: Blob; url: string };

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
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [photoProblems, setPhotoProblems] = useState<string[]>([]);
  const photoInputId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const create = mode.kind === "create";

  // Aperçus libérés quand le formulaire disparaît
  const urls = useRef<string[]>([]);
  useEffect(() => {
    urls.current = photos.map((p) => p.url);
  }, [photos]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  /** Photos choisies d'abord (S7.5-T03) : réduites tout de suite sur le téléphone, envoyées après la création. */
  const choosePhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    const room = MAX_PHOTOS - photos.length;
    const issues: string[] = [];
    if (files.length > room) issues.push(`${MAX_PHOTOS} photos au plus par produit.`);
    const added: PendingPhoto[] = [];
    for (const [index, file] of files.slice(0, Math.max(room, 0)).entries()) {
      setPhotoStatus(`Photo ${index + 1} : préparation…`);
      const reduced = await reduce(file);
      if ("error" in reduced) {
        issues.push(`${file.name.slice(0, 40)} : ${reduced.error}`);
        continue;
      }
      added.push({ blob: reduced.blob, url: URL.createObjectURL(reduced.blob) });
    }
    setPhotoStatus(null);
    setPhotoProblems(issues);
    setPhotos((list) => [...list, ...added]);
  };
  const removePhoto = (index: number) =>
    setPhotos((list) => {
      const target = list[index];
      if (target) URL.revokeObjectURL(target.url);
      return list.filter((_, i) => i !== index);
    });

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
        // Photos choisies d'abord : envoyées une par une au produit tout juste créé
        let failed = 0;
        for (const [index, photo] of photos.entries()) {
          setPhotoStatus(`Envoi de la photo ${index + 1} sur ${photos.length}…`);
          const sent = await sendPhoto(result.id, photo.blob);
          if (!sent.ok) {
            failed += 1;
            if (sent.signedOut) break;
          }
        }
        setPhotoStatus(null);
        router.push(
          `/vendeur/produits/${result.id}?ok=${failed > 0 ? "produit-cree-photos" : "produit-cree"}`,
        );
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
      {create && (
        <fieldset className="space-y-3">
          <legend className="text-lg font-extrabold">Photos du produit</legend>
          <p className="text-ink-500 text-sm">
            Commencez par les photos : elles aident à bien décrire le produit. La première est la
            principale ({MAX_PHOTOS} au plus, réduites sur votre téléphone).
          </p>
          {photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5" aria-label="Photos choisies">
              {photos.map((photo, index) => (
                <li key={photo.url} className="relative">
                  {/* Aperçu local (blob:) : jamais envoyé à l'optimiseur */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={`Photo ${index + 1}${index === 0 ? " (principale)" : ""}`}
                    className="border-ink-100 bg-ink-50 aspect-square w-full rounded-lg border object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="bg-ink-900/80 absolute right-1 top-1 rounded-full p-1 text-white"
                  >
                    <X className="size-4" aria-hidden />
                    <span className="sr-only">Retirer la photo {index + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < MAX_PHOTOS && (
            <label
              htmlFor={photoInputId}
              className="border-ink-200 hover:bg-ink-50 inline-flex cursor-pointer items-center gap-2 rounded-full border-2 px-5 py-2.5 text-sm font-semibold focus-within:ring-4"
            >
              <ImagePlus className="size-4" aria-hidden /> Choisir des photos
              <input
                id={photoInputId}
                type="file"
                // Types listés : un iPhone convertit alors ses photos HEIC en JPEG au moment du choix
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={pending}
                onChange={choosePhotos}
                className="sr-only"
              />
            </label>
          )}
          <p role="status" aria-live="polite" className="text-sm font-semibold">
            {photoStatus}
          </p>
          {photoProblems.length > 0 && (
            <FormAlert>
              <ul className="list-disc space-y-1 pl-5">
                {photoProblems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </FormAlert>
          )}
        </fieldset>
      )}
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
          ? "Le produit reste invisible des clients jusqu'à sa validation par l'équipe Kemdia. Vous pourrez encore ajouter ou changer des photos tant qu'il n'est pas en ligne."
          : "Modifier la fiche renvoie le produit en modération : il est caché des clients en attendant."}
      </p>
    </form>
  );
}
