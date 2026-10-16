"use client";

import { SHOP_LIMITS } from "@kemdia/contracts/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Field, FormAlert, SubmitButton, TextAreaField } from "@/components/ui/Field";
import { applyShopAction } from "@/lib/vendor/actions";
import {
  checkShopRequest,
  type ShopRequestFields,
  type ShopRequestInput,
} from "@/lib/vendor/forms";

type Errors = Partial<Record<ShopRequestFields, string>>;
const UNAVAILABLE = "Service momentanément indisponible. Réessayez dans quelques instants.";

/**
 * Demande d'ouverture de boutique (S6-T06, ADR-0032 et 0037) : envoyée à l'API, examinée par un administrateur.
 * Après un refus, le formulaire revient avec les informations précédentes pour corriger et redemander.
 */
export function ShopRequestForm({
  initial,
  again = false,
}: {
  initial?: Partial<ShopRequestInput>;
  again?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ShopRequestInput>({
    name: initial?.name ?? "",
    city: initial?.city ?? "",
    phone: initial?.phone ?? "",
    description: initial?.description ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<{ message: string; signedOut?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const set = (key: ShopRequestFields) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const focusError = () =>
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setAlert(null);
    const checked = checkShopRequest(values);
    if (!checked.ok) {
      setErrors(checked.errors);
      return focusError();
    }
    setErrors({});
    setPending(true);
    const result = await applyShopAction(values).catch(() => null);
    if (result?.ok) {
      // Rechargement complet : la page affiche la demande en cours (et l'en-tête reste juste)
      router.push("/vendeur?ok=demande-envoyee");
      return;
    }
    setPending(false);
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
            <Link href="/connexion?retour=/vendeur" className="font-semibold underline">
              Se reconnecter
            </Link>
          )}
        </FormAlert>
      )}
      <Field
        label="Nom de la boutique"
        name="name"
        autoComplete="organization"
        maxLength={S.nameMax}
        value={values.name}
        onChange={(e) => set("name")(e.target.value)}
        error={errors.name}
        hint="Visible des clients. Le mot « Kemdia » n'est pas permis."
        required
      />
      <Field
        label="Ville"
        name="city"
        autoComplete="address-level2"
        maxLength={S.cityMax}
        placeholder="Libreville"
        value={values.city}
        onChange={(e) => set("city")(e.target.value)}
        error={errors.city}
        required
      />
      <Field
        label="Mobile de contact"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={20}
        placeholder="077 12 34 56"
        value={values.phone}
        onChange={(e) => set("phone")(e.target.value)}
        error={errors.phone}
        hint="L'équipe Kemdia vous appelle à ce numéro (Airtel ou Moov)."
        required
      />
      <TextAreaField
        label="Ce que vous vendez"
        name="description"
        rows={4}
        maxLength={S.descriptionMax}
        value={values.description}
        onChange={(e) => set("description")(e.target.value)}
        error={errors.description}
        hint={`${values.description.trim().length} / ${S.descriptionMax} caractères (${S.descriptionMin} au moins).`}
        required
      />
      <SubmitButton pending={pending}>
        {again ? "Envoyer une nouvelle demande" : "Envoyer ma demande"}
      </SubmitButton>
      <p className="text-ink-500 text-sm">
        Un administrateur Kemdia examine chaque demande avant toute vente. La vérification
        d&apos;identité et les conditions (commission, versements) vous seront présentées avant
        l&apos;ouverture.
      </p>
    </form>
  );
}
