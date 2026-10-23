"use client";

import { SHOP_LIMITS } from "@kemdia/contracts/constants";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { FormAlert, SubmitButton, TextAreaField } from "@/components/ui/Field";
import { updateShopProfileAction } from "@/lib/vendor/actions";
import {
  checkShopProfile,
  type ShopProfileFields,
  type ShopProfileInput,
} from "@/lib/vendor/forms";
import { ShopPlaceFields } from "./ShopPlaceFields";

type Errors = Partial<Record<ShopProfileFields, string>>;
const UNAVAILABLE = "Service momentanément indisponible. Réessayez dans quelques instants.";

/**
 * « Ma boutique » (S7.5-T07) : ville, quartier et description, changés tout de suite (sans nouvel examen) et montrés
 * sur la page publique de la boutique. Le nom ne change pas ici : il passe par l'équipe Kemdia.
 */
export function ShopProfileForm({ initial }: { initial: ShopProfileInput }) {
  const [values, setValues] = useState<ShopProfileInput>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<{ message: string; signedOut?: boolean } | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusError = () =>
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setAlert(null);
    setSaved(false);
    const checked = checkShopProfile(values);
    if (!checked.ok) {
      setErrors(checked.errors);
      return focusError();
    }
    setErrors({});
    setPending(true);
    const result = await updateShopProfileAction(checked.value).catch(() => null);
    setPending(false);
    if (result?.ok) return setSaved(true);
    if (!result) return setAlert({ message: UNAVAILABLE });
    if (result.errors) {
      setErrors(result.errors as Errors);
      focusError();
    }
    setAlert(result);
  };

  const S = SHOP_LIMITS;
  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5 rounded-xl bg-white p-6">
      {alert && (
        <FormAlert>
          {alert.message}{" "}
          {alert.signedOut && (
            <Link href="/connexion?retour=/vendeur/boutique" className="font-semibold underline">
              Se reconnecter
            </Link>
          )}
        </FormAlert>
      )}
      {saved && (
        <p role="status" className="bg-brand-50 text-ink-800 rounded-lg px-4 py-2.5 text-sm">
          Boutique mise à jour. La page publique suit dans la minute.
        </p>
      )}
      <ShopPlaceFields
        city={values.city}
        neighborhood={values.neighborhood}
        onChange={(place) => {
          setSaved(false);
          setValues((v) => ({ ...v, ...place }));
        }}
        errors={{ city: errors.city, neighborhood: errors.neighborhood }}
      />
      <TextAreaField
        label="Description"
        name="description"
        rows={5}
        maxLength={S.descriptionMax}
        value={values.description}
        onChange={(e) => {
          setSaved(false);
          setValues((v) => ({ ...v, description: e.target.value }));
        }}
        error={errors.description}
        hint={`Ce que vous vendez, montré sur votre page publique (${S.descriptionMin} à ${S.descriptionMax} caractères).`}
        required
      />
      <SubmitButton pending={pending}>Enregistrer</SubmitButton>
    </form>
  );
}
