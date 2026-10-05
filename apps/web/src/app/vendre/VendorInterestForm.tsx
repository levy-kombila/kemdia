"use client";

import { CircleCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Field, FormAlert, SelectField, SubmitButton } from "@/components/ui/Field";
import { CITIES } from "@/lib/delivery";
import {
  LEAD_MESSAGE_MAX,
  SHOP_NAME_MAX,
  validateVendorLead,
  VENDOR_CATEGORIES,
  type VendorLead,
} from "@/lib/vendor-lead";

const EMPTY: VendorLead = {
  fullName: "",
  shopName: "",
  phone: "",
  cityId: "",
  category: "",
  message: "",
};

export function VendorInterestForm() {
  const [lead, setLead] = useState<VendorLead>(EMPTY);
  const [errors, setErrors] = useState<ReturnType<typeof validateVendorLead>>({});
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof VendorLead) => (v: string) => setLead((l) => ({ ...l, [k]: v }));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const errs = validateVendorLead(lead);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    setPending(true);
    // Démonstration : rien n'est envoyé. S6 : POST /api/v1/vendors/leads (limitation de débit, anti-robots)
    await new Promise((r) => setTimeout(r, 600));
    setPending(false);
    setSent(lead.fullName.trim().split(/\s+/)[0] ?? "");
    setLead(EMPTY);
  }

  if (sent !== null) {
    return (
      <div className="text-center" role="status">
        <CircleCheck className="text-forest-600 mx-auto size-14" aria-hidden />
        <p className="mt-3 text-lg font-bold">Merci {sent}, votre demande est prête</p>
        <div className="mt-3">
          <FormAlert tone="info">
            <strong>Mode démonstration</strong> : la demande n&apos;est pas encore transmise.
            L&apos;inscription des vendeurs ouvrira avec l&apos;espace vendeur.
          </FormAlert>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Prénom et nom"
        autoComplete="name"
        value={lead.fullName}
        onChange={(e) => set("fullName")(e.target.value)}
        error={errors.fullName}
        maxLength={120}
      />
      <Field
        label="Nom de la boutique"
        autoComplete="organization"
        value={lead.shopName}
        onChange={(e) => set("shopName")(e.target.value)}
        error={errors.shopName}
        maxLength={SHOP_NAME_MAX}
      />
      <Field
        label="Téléphone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="077 12 34 56"
        value={lead.phone}
        onChange={(e) => set("phone")(e.target.value)}
        error={errors.phone}
        hint="De préférence avec WhatsApp."
        maxLength={20}
      />
      <SelectField
        label="Ville"
        value={lead.cityId}
        onChange={(e) => set("cityId")(e.target.value)}
        error={errors.cityId}
      >
        <option value="">Choisir…</option>
        {CITIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        className="sm:col-span-2"
        label="Ce que vous vendez"
        value={lead.category}
        onChange={(e) => set("category")(e.target.value)}
        error={errors.category}
      >
        <option value="">Choisir…</option>
        {VENDOR_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>
      <div className="sm:col-span-2">
        <label
          htmlFor="vendeur-message"
          className="text-ink-800 mb-1.5 block text-sm font-semibold"
        >
          Votre activité <span className="text-ink-500 font-normal">(facultatif)</span>
        </label>
        <textarea
          id="vendeur-message"
          rows={3}
          value={lead.message}
          onChange={(e) => set("message")(e.target.value)}
          maxLength={LEAD_MESSAGE_MAX}
          placeholder="Ex. boutique de téléphones à Mont-Bouët depuis 5 ans, environ 40 références"
          className="border-ink-200 focus:border-brand-600 focus:ring-brand-100 w-full rounded-xl border bg-white px-4 py-3 text-base outline-none focus:ring-4"
        />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending}>Envoyer ma demande</SubmitButton>
      </div>
    </form>
  );
}
