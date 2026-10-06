"use client";

import {
  BadgeCheck,
  CircleCheck,
  LoaderCircle,
  Lock,
  ShoppingCart,
  Smartphone,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { useDeliveryLocation } from "@/components/providers/LocationProvider";
import { Field, FormAlert, SelectField, SubmitButton } from "@/components/ui/Field";
import { formatGabonPhone, normalizeGabonPhone } from "@/lib/auth/validation";
import type { CartLine } from "@/lib/cart";
import {
  buildOrderRequest,
  codAvailability,
  LANDMARK_MAX,
  OTHER_NEIGHBORHOOD,
  PAYMENT_METHODS,
  validateAddress,
  validatePaymentPhone,
  type Address,
  type AddressErrors,
  type PaymentMethod,
} from "@/lib/checkout";
import { cn } from "@/lib/cn";
import { CITIES, deliveryWindow, estimateDelivery, getCity } from "@/lib/delivery";
import { formatFCFA } from "@/lib/format";
import { orderClient } from "@/lib/orders/client";
import { OrderSummary } from "./OrderSummary";
import { StepCard, type StepState } from "./StepCard";

type Step = 1 | 2 | 3 | 4;
type Phase =
  | { name: "form" }
  | { name: "awaiting-payment"; orderNumber: string }
  | {
      name: "done";
      orderNumber: string;
      lines: CartLine[];
      total: number;
      address: Address;
      method: PaymentMethod;
      when: string;
    };

const stateOf = (n: Step, current: Step): StepState =>
  n < current ? "done" : n === current ? "current" : "todo";

export function CheckoutFlow() {
  const { state, hydrated, subtotal, clear } = useCart();
  const { location, setLocation } = useDeliveryLocation();
  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const [draft, setDraft] = useState<Address>({
    fullName: "",
    phone: "",
    cityId: "",
    neighborhood: "",
    landmark: "",
  });
  // Ville déjà choisie sur le site → pré-remplie tant que la personne n'en a pas choisi une autre
  const address: Address = draft.cityId
    ? draft
    : { ...draft, cityId: location?.cityId ?? "", neighborhood: location?.neighborhood ?? "" };
  const setAddress = (update: (a: Address) => Address) => setDraft(update(address));
  const [errors, setErrors] = useState<AddressErrors>({});
  const [method, setMethod] = useState<PaymentMethod>("airtel");
  const [payPhone, setPayPhone] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(false);
  const stepRef = useRef<HTMLOListElement>(null);

  // À chaque changement d'étape (pas au chargement), le titre de l'étape en cours reçoit le focus
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepRef.current?.querySelector<HTMLElement>('[aria-current="step"] h2')?.focus();
  }, [step]);

  const city = getCity(address.cityId);
  const estimate = city ? estimateDelivery(city.id, subtotal) : null;
  const fee = estimate?.fee ?? null;
  const total = subtotal + (fee ?? 0);
  const when = estimate ? deliveryWindow(new Date(), estimate.daysMin, estimate.daysMax) : "";
  const cod = city ? codAvailability(city.id, total) : { allowed: false as const, reason: "" };

  if (!hydrated)
    return (
      <div
        className="h-64 animate-pulse rounded-xl bg-white"
        aria-busy="true"
        aria-label="Chargement"
      />
    );

  if (phase.name === "done") return <Confirmation {...phase} />;

  if (state.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-14 text-center">
        <ShoppingCart className="text-ink-400 size-12" aria-hidden />
        <h1 className="text-xl font-extrabold">Votre panier est vide</h1>
        <p className="text-ink-500 text-sm">Ajoutez des articles avant de passer commande.</p>
        <Link
          href="/"
          className="bg-brand-600 mt-2 rounded-full px-6 py-3 font-semibold text-white"
        >
          Continuer mes achats
        </Link>
      </div>
    );
  }

  const set = (k: keyof Address) => (v: string) => setAddress((a) => ({ ...a, [k]: v }));

  function submitAddress(e: FormEvent) {
    e.preventDefault();
    const errs = validateAddress(address);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      requestAnimationFrame(() =>
        (e.target as HTMLFormElement).querySelector<HTMLElement>("[aria-invalid=true]")?.focus(),
      );
      return;
    }
    setLocation({
      cityId: address.cityId,
      neighborhood: address.neighborhood === OTHER_NEIGHBORHOOD ? null : address.neighborhood,
    });
    // Numéro de paiement proposé par défaut : celui de l'adresse, avec l'opérateur correspondant
    const phone = normalizeGabonPhone(address.phone);
    if (phone && !payPhone) {
      setPayPhone(formatGabonPhone(phone.value));
      setMethod(phone.operator === "Moov" ? "moov" : "airtel");
    }
    setStep(2);
  }

  function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (method === "cod" && !cod.allowed) return;
    const err = validatePaymentPhone(method, payPhone);
    setPayError(err);
    if (!err) setStep(4);
  }

  async function placeOrder() {
    if (pending) return;
    setPending(true);
    setFailure(false);
    const lines = state.lines;
    const result = await orderClient.placeOrder(
      buildOrderRequest(lines, address, method, payPhone),
    );
    if (!result.ok) {
      setPending(false);
      setFailure(true);
      return;
    }
    const done = {
      name: "done" as const,
      orderNumber: result.orderNumber,
      lines,
      total,
      address,
      method,
      when,
    };
    if (result.status === "awaiting-payment") {
      setPhase({ name: "awaiting-payment", orderNumber: result.orderNumber });
      const paid = await orderClient.waitForPayment(result.orderNumber);
      if (!paid.ok) {
        setPhase({ name: "form" });
        setPending(false);
        setFailure(true);
        return;
      }
    }
    clear();
    setPhase(done);
    window.scrollTo({ top: 0 });
  }

  const neighborhoods = city?.neighborhoods ?? [];

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Finaliser ma commande</h1>
          <p className="text-ink-500 hidden items-center gap-1.5 text-sm sm:flex">
            <Lock className="size-4" aria-hidden /> Paiement sécurisé
          </p>
        </div>
        <FormAlert tone="info">
          <strong>Mode démonstration</strong> : aucune commande n&apos;est enregistrée et aucun
          paiement n&apos;est demandé.
        </FormAlert>
        <div className="lg:hidden">
          <OrderSummary lines={state.lines} subtotal={subtotal} fee={fee} total={total} />
        </div>

        <ol ref={stepRef} className="space-y-3">
          <StepCard
            n={1}
            title="Adresse de livraison"
            state={stateOf(1, step)}
            onEdit={() => setStep(1)}
            summary={
              <>
                <strong>{address.fullName}</strong> · {address.phone}
                <br />
                {address.neighborhood && address.neighborhood !== OTHER_NEIGHBORHOOD
                  ? `${address.neighborhood}, `
                  : ""}
                {city?.name} · {address.landmark}
              </>
            }
          >
            <form onSubmit={submitAddress} noValidate className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Prénom et nom"
                autoComplete="name"
                value={address.fullName}
                onChange={(e) => set("fullName")(e.target.value)}
                error={errors.fullName}
                maxLength={120}
              />
              <Field
                label="Téléphone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="077 12 34 56"
                value={address.phone}
                onChange={(e) => set("phone")(e.target.value)}
                error={errors.phone}
                hint="Le livreur vous appelle avant de passer."
                maxLength={20}
              />
              <SelectField
                label="Ville"
                value={address.cityId}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, cityId: e.target.value, neighborhood: "" }))
                }
                error={errors.cityId}
                autoComplete="address-level2"
              >
                <option value="">Choisir…</option>
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Quartier"
                value={address.neighborhood}
                onChange={(e) => set("neighborhood")(e.target.value)}
                error={errors.neighborhood}
                disabled={!city}
              >
                <option value="">{city ? "Choisir…" : "Choisissez d'abord la ville"}</option>
                {neighborhoods.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                {city && (
                  <option value={OTHER_NEIGHBORHOOD}>
                    {OTHER_NEIGHBORHOOD} (à préciser ci-dessous)
                  </option>
                )}
              </SelectField>
              <Field
                className="sm:col-span-2"
                label="Point de repère"
                placeholder="Ex. après le carrefour, portail bleu face à la pharmacie"
                value={address.landmark}
                onChange={(e) => set("landmark")(e.target.value)}
                error={errors.landmark}
                hint="Ce qui aide le livreur à trouver votre porte."
                maxLength={LANDMARK_MAX}
              />
              <div className="sm:col-span-2 sm:max-w-xs">
                <SubmitButton pending={false}>Continuer</SubmitButton>
              </div>
            </form>
          </StepCard>

          <StepCard
            n={2}
            title="Livraison"
            state={stateOf(2, step)}
            onEdit={() => setStep(2)}
            summary={
              estimate && (
                <>
                  À domicile, livraison prévue {when} ·{" "}
                  {fee === 0 ? "offerte" : formatFCFA(fee ?? 0)}
                </>
              )
            }
          >
            {estimate && city && (
              <div className="space-y-4">
                <div className="border-brand-600 bg-brand-50/40 flex items-start gap-3 rounded-xl border-2 p-4">
                  <Truck className="text-brand-600 mt-0.5 size-5 shrink-0" aria-hidden />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold">Livraison à domicile, {city.name}</p>
                    <p>
                      Livraison prévue <strong>{when}</strong>
                    </p>
                    <p className="text-ink-500">
                      Le livreur vous appelle au {address.phone} avant de passer.
                    </p>
                  </div>
                  <p className="font-semibold">
                    {estimate.isFree ? (
                      <span className="text-forest-700">Offerte</span>
                    ) : (
                      formatFCFA(estimate.fee)
                    )}
                  </p>
                </div>
                {estimate.remainingForFree > 0 && (
                  <p className="text-ink-700 text-sm">
                    Ajoutez {formatFCFA(estimate.remainingForFree)} d&apos;articles pour une
                    livraison offerte.{" "}
                    <Link href="/panier" className="text-brand-700 font-semibold underline">
                      Retour au panier
                    </Link>
                  </p>
                )}
                <div className="sm:max-w-xs">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="bg-brand-600 hover:bg-brand-700 h-12 w-full rounded-full font-semibold text-white"
                  >
                    Continuer
                  </button>
                </div>
              </div>
            )}
          </StepCard>

          <StepCard
            n={3}
            title="Paiement"
            state={stateOf(3, step)}
            onEdit={() => setStep(3)}
            summary={
              <>
                {PAYMENT_METHODS[method].label}
                {method !== "cod" && ` · ${payPhone}`}
              </>
            }
          >
            <form onSubmit={submitPayment} noValidate className="space-y-3">
              <fieldset className="space-y-2">
                <legend className="sr-only">Moyen de paiement</legend>
                {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => {
                  const disabled = m === "cod" && !cod.allowed;
                  const Icon = m === "cod" ? Wallet : Smartphone;
                  return (
                    <label
                      key={m}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition",
                        method === m
                          ? "border-brand-600 bg-brand-50/40"
                          : "border-ink-100 hover:border-ink-200",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value={m}
                        checked={method === m}
                        disabled={disabled}
                        onChange={() => {
                          setMethod(m);
                          setPayError(null);
                        }}
                        className="accent-brand-600 mt-1 size-4"
                      />
                      <Icon className="text-ink-700 mt-0.5 size-5 shrink-0" aria-hidden />
                      <span className="flex-1 text-sm">
                        <span className="block font-semibold">{PAYMENT_METHODS[m].label}</span>
                        <span className="text-ink-500">
                          {m === "cod"
                            ? disabled
                              ? cod.reason
                              : "Payez en espèces ou par Mobile Money à la réception."
                            : "Vous validez le paiement sur votre téléphone avec votre code secret."}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {method !== "cod" && (
                <Field
                  label={`Numéro ${PAYMENT_METHODS[method].label}`}
                  type="tel"
                  inputMode="tel"
                  placeholder={method === "airtel" ? "077 12 34 56" : "066 12 34 56"}
                  value={payPhone}
                  onChange={(e) => setPayPhone(e.target.value)}
                  error={payError}
                  hint="Une demande de paiement sera envoyée sur ce numéro."
                  className="sm:max-w-sm"
                  maxLength={20}
                />
              )}
              <div className="sm:max-w-xs">
                <SubmitButton pending={false}>Continuer</SubmitButton>
              </div>
            </form>
          </StepCard>

          <StepCard n={4} title="Vérifier et commander" state={stateOf(4, step)}>
            <div className="space-y-4 text-sm">
              <ul className="divide-ink-100 border-ink-100 divide-y rounded-xl border">
                <li className="flex gap-3 px-4 py-3">
                  <Truck className="text-ink-500 size-5 shrink-0" aria-hidden />
                  <span>
                    Livraison prévue <strong>{when}</strong> à{" "}
                    {address.neighborhood !== OTHER_NEIGHBORHOOD && `${address.neighborhood}, `}
                    {city?.name}
                  </span>
                </li>
                <li className="flex gap-3 px-4 py-3">
                  <Smartphone className="text-ink-500 size-5 shrink-0" aria-hidden />
                  <span>
                    {PAYMENT_METHODS[method].label}
                    {method !== "cod" && ` : demande de paiement envoyée au ${payPhone}`}
                  </span>
                </li>
                <li className="flex gap-3 px-4 py-3">
                  <BadgeCheck className="text-ink-500 size-5 shrink-0" aria-hidden />
                  <span>Vendu et expédié par Kemdia · retour gratuit sous 14 jours</span>
                </li>
              </ul>
              {failure && (
                <FormAlert>
                  La commande n&apos;a pas pu être passée. Vérifiez votre connexion et réessayez.
                </FormAlert>
              )}
              <button
                type="button"
                onClick={placeOrder}
                disabled={pending}
                aria-busy={pending}
                className="bg-accent-400 hover:bg-accent-300 text-ink-900 flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold transition disabled:opacity-70 sm:max-w-md"
              >
                {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
                {method === "cod" ? "Confirmer la commande" : "Commander et payer"} ·{" "}
                {formatFCFA(total)}
              </button>
              <p className="text-ink-500 text-xs">
                En commandant, vous acceptez les{" "}
                <Link href="/infos/cgv" className="underline" target="_blank">
                  conditions générales de vente
                </Link>
                . Le montant final est vérifié par nos serveurs.
              </p>
            </div>
          </StepCard>
        </ol>
      </div>

      <div className="hidden lg:block">
        <OrderSummary lines={state.lines} subtotal={subtotal} fee={fee} total={total} />
      </div>

      {phase.name === "awaiting-payment" && (
        <AwaitingPayment method={method} phone={payPhone} total={total} />
      )}
    </div>
  );
}

/** Écran d'attente Mobile Money : le client valide sur son téléphone (code secret). */
function AwaitingPayment({
  method,
  phone,
  total,
}: {
  method: PaymentMethod;
  phone: string;
  total: number;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="attente-titre"
      aria-describedby="attente-texte"
      className="bg-ink-900/60 fixed inset-0 z-[60] grid place-items-center p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center">
        <span className="bg-brand-50 mx-auto grid size-16 place-items-center rounded-full">
          <Smartphone className="text-brand-600 size-8 animate-pulse" aria-hidden />
        </span>
        <h2 id="attente-titre" className="mt-3 text-xl font-extrabold">
          Validez sur votre téléphone
        </h2>
        <p id="attente-texte" className="text-ink-700 mt-2 text-sm">
          Une demande {PAYMENT_METHODS[method].label} de <strong>{formatFCFA(total)}</strong> a été
          envoyée au <strong>{phone}</strong>. Saisissez votre code secret pour confirmer.
        </p>
        <p
          className="text-ink-500 mt-4 flex items-center justify-center gap-2 text-sm"
          role="status"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> En attente de votre
          validation…
        </p>
        <p className="text-ink-500 mt-3 text-xs">Mode démonstration : la validation est simulée.</p>
      </div>
    </div>
  );
}

function Confirmation({
  orderNumber,
  lines,
  total,
  address,
  method,
  when,
}: Extract<Phase, { name: "done" }>) {
  const city = getCity(address.cityId);
  const firstName = address.fullName.trim().split(/\s+/)[0];
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="rounded-xl bg-white px-6 py-8 text-center">
        <CircleCheck className="text-forest-600 mx-auto size-16" aria-hidden />
        <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">
          Merci {firstName}, votre commande est confirmée
        </h1>
        <p className="text-ink-500 mt-2">
          Numéro de commande{" "}
          <strong className="text-ink-900 font-price text-lg tracking-wide">{orderNumber}</strong>
        </p>
        <p className="text-ink-500 mt-1 text-xs">
          Mode démonstration : aucune commande réelle n&apos;a été créée.
        </p>
      </div>
      <dl className="divide-ink-100 grid divide-y rounded-xl bg-white text-sm">
        <div className="flex gap-4 px-5 py-3.5">
          <dt className="text-ink-500 w-28 shrink-0">Livraison</dt>
          <dd>
            Prévue <strong>{when}</strong>
            <br />
            {address.fullName},{" "}
            {address.neighborhood !== OTHER_NEIGHBORHOOD && `${address.neighborhood}, `}
            {city?.name} · {address.landmark}
          </dd>
        </div>
        <div className="flex gap-4 px-5 py-3.5">
          <dt className="text-ink-500 w-28 shrink-0">Paiement</dt>
          <dd>
            {PAYMENT_METHODS[method].label}
            {method === "cod" ? " : à régler au livreur" : " : payé"} ·{" "}
            <strong>{formatFCFA(total)}</strong>
          </dd>
        </div>
        <div className="flex gap-4 px-5 py-3.5">
          <dt className="text-ink-500 w-28 shrink-0">Articles</dt>
          <dd>
            {lines.map((l) => (
              <span key={l.variantId} className="block">
                {l.quantity} × {l.title}
              </span>
            ))}
          </dd>
        </div>
      </dl>
      <p className="text-ink-500 px-1 text-sm">
        Le livreur vous appellera au {address.phone} avant de passer.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/"
          className="bg-brand-600 hover:bg-brand-700 rounded-full px-6 py-3 font-semibold text-white"
        >
          Continuer mes achats
        </Link>
      </div>
    </div>
  );
}
