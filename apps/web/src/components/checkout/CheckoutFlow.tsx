"use client";

import type { OrderQuote } from "@kemdia/contracts";
import { COUPON_CODE_PATTERN } from "@kemdia/contracts/constants";
import {
  BadgeCheck,
  LoaderCircle,
  Lock,
  ShoppingCart,
  Smartphone,
  Tag,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { useDeliveryLocation } from "@/components/providers/LocationProvider";
import { Field, FormAlert, SelectField, SubmitButton } from "@/components/ui/Field";
import { formatGabonPhone, normalizeGabonPhone } from "@/lib/auth/validation";
import {
  buildOrderRequest,
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
import { placeOrder, quoteOrder } from "@/lib/orders/order-actions";
import { newUuid } from "@/lib/uuid";
import { OrderSummary } from "./OrderSummary";
import { StepCard, type StepState } from "./StepCard";

type Step = 1 | 2 | 3 | 4;

/** Réponse du serveur à une demande de devis, rangée avec la clé de la demande (ville, code promo, panier). */
type QuoteAnswer =
  { key: string; ok: true; quote: OrderQuote } | { key: string; ok: false; message: string };

/** Problème bloquant au moment de commander (au-dessus du bouton), avec un lien utile. */
type Problem = { message: string; link?: { href: string; label: string } } | null;

const CART_LINK = { href: "/panier", label: "Voir mon panier" };
const ORDERS_LINK = { href: "/compte/commandes", label: "Voir mes commandes" };

const stateOf = (n: Step, current: Step): StepState =>
  n < current ? "done" : n === current ? "current" : "todo";

const UNAVAILABLE = "Le service ne répond pas pour le moment. Réessayez dans un instant.";

export type CheckoutAccount = { fullName: string; phone: string | null };

/**
 * Tunnel de commande branché sur l'API (S5-T07, ADR-0029). Le compte est obligatoire : la page redirige vers la
 * connexion avant d'arriver ici. Tous les montants affichés comme définitifs viennent du DEVIS du serveur (frais,
 * remise, total, moyens de paiement possibles) ; la commande part avec ce total (`expectedTotal`) : s'il a changé
 * entre-temps, l'API refuse (`PRIX_MODIFIE`) et le client confirme le nouveau total.
 * Après la commande : page de la commande (attente du paiement Mobile Money ou confirmation).
 */
export function CheckoutFlow({ account }: { account: CheckoutAccount }) {
  const router = useRouter();
  const { state, hydrated, mode, subtotal, canCheckout, reload } = useCart();
  const { location, setLocation } = useDeliveryLocation();
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<Address>({
    fullName: account.fullName,
    phone: account.phone ? formatGabonPhone(account.phone) : "",
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
  const [chosenMethod, setMethod] = useState<PaymentMethod>("airtel");
  const [payPhone, setPayPhone] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  // Ville de l'adresse validée à l'étape 1 : c'est elle qui sert au devis
  const [quotedCity, setQuotedCity] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPending, setCouponPending] = useState(false);
  // Dernière réponse, et dernier devis accepté (affiché pendant qu'un nouveau devis se calcule)
  const [answer, setAnswer] = useState<QuoteAnswer | null>(null);
  const [lastQuote, setLastQuote] = useState<OrderQuote | null>(null);
  // Augmenté pour redemander le devis à l'identique (total changé entre-temps)
  const [quoteRound, setQuoteRound] = useState(0);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  // Une clé par commande voulue : renvoyée telle quelle à chaque nouvel essai (jamais deux commandes)
  const idempotencyKey = useRef<string>("");
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

  // Devis du serveur : ville validée, code promo accepté, contenu du panier (un autre onglet peut le changer)
  const cartKey = state.lines.map((l) => `${l.variantId}:${l.quantity}`).join(",");
  const quoteKey =
    quotedCity && mode === "server"
      ? `${quotedCity}|${coupon ?? ""}|${cartKey}|${quoteRound}`
      : null;
  const answered = useRef<string | null>(null);
  useEffect(() => {
    // Déjà répondu pour cette clé (code promo vérifié à l'instant) : pas de deuxième appel
    if (!quoteKey || answered.current === quoteKey) return;
    let cancelled = false;
    quoteOrder(quotedCity!, coupon ?? undefined)
      .catch(() => ({ ok: false as const, code: "INDISPONIBLE" as const, message: UNAVAILABLE }))
      .then((result) => {
        if (cancelled) return;
        answered.current = quoteKey;
        if (result.ok) {
          setAnswer({ key: quoteKey, ok: true, quote: result.quote });
          setLastQuote(result.quote);
        } else if (coupon && result.code.startsWith("COUPON_")) {
          // Le code n'est plus valable (expiré, épuisé…) : retiré, le devis repart sans lui
          setCoupon(null);
          setCouponError(result.message);
        } else {
          setAnswer({ key: quoteKey, ok: false, message: result.message || UNAVAILABLE });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [quoteKey, quotedCity, coupon]);

  const fresh = answer && answer.key === quoteKey ? answer : null;
  const quoteLoading = quoteKey !== null && fresh === null;
  const quoteError = fresh && !fresh.ok ? fresh.message : null;
  const quoteReady = fresh?.ok === true;
  const current = fresh?.ok ? fresh.quote : lastQuote;
  const city = getCity(address.cityId);
  // Avant le devis : estimation locale (indicative) ; ensuite, les montants du serveur
  const local = city ? estimateDelivery(city.id, subtotal) : null;
  const fee = current ? current.deliveryFee : (local?.fee ?? null);
  const total = current ? current.total : subtotal + (fee ?? 0);
  const daysMin = current?.deliveryDaysMin ?? local?.daysMin;
  const daysMax = current?.deliveryDaysMax ?? local?.daysMax;
  const when = daysMin && daysMax ? deliveryWindow(new Date(), daysMin, daysMax) : "";
  const remainingForFree = current
    ? Math.max(0, current.freeDeliveryThreshold - (current.subtotal - current.discount))
    : (local?.remainingForFree ?? 0);
  const mobileMoneyAllowed = current?.mobileMoney.allowed ?? true;
  const cod = current?.cod ?? { allowed: false, reason: "" };
  // Mobile Money indisponible (préproduction, production sans fournisseur) : la livraison est proposée d'office
  const method: PaymentMethod =
    current && !mobileMoneyAllowed && chosenMethod !== "cod" && cod.allowed ? "cod" : chosenMethod;

  if (!hydrated)
    return (
      <div
        className="h-64 animate-pulse rounded-xl bg-white"
        aria-busy="true"
        aria-label="Chargement"
      />
    );

  // Connecté, mais le panier du compte n'a pas pu être lu : on ne commande pas un panier qu'on ne voit pas
  if (mode !== "server") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-14 text-center">
        <ShoppingCart className="text-ink-400 size-12" aria-hidden />
        <h1 className="text-xl font-extrabold">Votre panier n&apos;a pas pu être chargé</h1>
        <p className="text-ink-500 max-w-sm text-sm">
          Le service ne répond pas pour le moment. Rechargez la page dans un instant.
        </p>
        <Link
          href="/commande"
          className="bg-brand-600 mt-2 rounded-full px-6 py-3 font-semibold text-white"
        >
          Réessayer
        </Link>
      </div>
    );
  }

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

  // Passage en caisse (S5-T01) : le panier du compte vient d'être revérifié par le serveur (BR-001)
  if (!canCheckout) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-14 text-center">
        <ShoppingCart className="text-ink-400 size-12" aria-hidden />
        <h1 className="text-xl font-extrabold">Votre panier est à vérifier</h1>
        <p className="text-ink-500 max-w-sm text-sm">
          Certains articles ne sont plus disponibles comme demandé (stock ou produit retiré).
        </p>
        <Link
          href="/panier"
          className="bg-brand-600 mt-2 rounded-full px-6 py-3 font-semibold text-white"
        >
          Voir mon panier
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
    setDraft(address);
    setLocation({
      cityId: address.cityId,
      neighborhood: address.neighborhood === OTHER_NEIGHBORHOOD ? null : address.neighborhood,
    });
    setQuotedCity(address.cityId);
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
    if (method !== "cod" && !mobileMoneyAllowed) return;
    const err = validatePaymentPhone(method, payPhone);
    setPayError(err);
    if (!err) setStep(4);
  }

  async function applyCoupon(e: FormEvent) {
    e.preventDefault();
    const code = couponInput.trim().toUpperCase();
    if (!COUPON_CODE_PATTERN.test(code)) {
      setCouponError("Code promo : 4 à 20 lettres, chiffres ou tirets.");
      return;
    }
    if (!quotedCity) return;
    setCouponPending(true);
    setCouponError(null);
    // Vérifié tout de suite (message sous le champ) ; accepté, il entre dans le devis
    const result = await quoteOrder(quotedCity, code).catch(() => null);
    setCouponPending(false);
    if (!result) {
      setCouponError("Le service ne répond pas pour le moment. Réessayez dans un instant.");
    } else if (result.ok) {
      const key = `${quotedCity}|${code}|${cartKey}|${quoteRound}`;
      answered.current = key;
      setAnswer({ key, ok: true, quote: result.quote });
      setLastQuote(result.quote);
      setCoupon(code);
      setCouponInput("");
    } else {
      setCouponError(result.message);
    }
  }

  async function submitOrder() {
    if (pending || !current || !quoteReady) return;
    setPending(true);
    setProblem(null);
    if (!idempotencyKey.current) idempotencyKey.current = newUuid();
    const request = buildOrderRequest(address, method, payPhone);
    const result = await placeOrder({
      ...request,
      idempotencyKey: idempotencyKey.current,
      expectedTotal: current.total,
      ...(coupon ? { couponCode: coupon } : {}),
    }).catch(() => null);

    if (result?.ok) {
      // L'API a retiré les articles commandés du panier du compte : l'en-tête et le panier se mettent à jour
      await reload();
      const extra = result.paymentError ? `&paiement=${result.paymentError}` : "";
      router.push(`/compte/commandes/${result.reference}?nouvelle=1${extra}`);
      return;
    }
    setPending(false);
    if (!result) {
      // Réponse perdue : la même clé sera renvoyée, l'API rendra la commande si elle a été créée
      setProblem({
        message: "La commande n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.",
      });
      return;
    }
    switch (result.code) {
      case "PRIX_MODIFIE":
        // Nouveau devis : le bouton affiche le nouveau total, le client confirme en connaissance de cause
        setProblem({ message: result.message });
        setQuoteRound((n) => n + 1);
        break;
      case "CLE_DEJA_UTILISEE":
        // Un envoi précédent (réponse perdue) a pu créer la commande : on le dit, panier relu (vidé s'il a été commandé).
        // Une nouvelle clé seulement ensuite, pour une commande que le client choisit de repasser (relecture S5-T07)
        idempotencyKey.current = newUuid();
        await reload();
        setProblem({ message: result.message, link: ORDERS_LINK });
        break;
      case "PANIER_VIDE":
      case "PANIER_A_VERIFIER":
        await reload();
        setProblem({ message: result.message, link: CART_LINK });
        break;
      default:
        if (result.code.startsWith("COUPON_")) {
          setCoupon(null);
          setCouponError(result.message);
        } else {
          setProblem({
            message: result.message,
            link: result.code === "TROP_DE_COMMANDES_OUVERTES" ? ORDERS_LINK : undefined,
          });
        }
    }
  }

  const neighborhoods = city?.neighborhoods ?? [];
  const summary = (
    <OrderSummary
      lines={state.lines}
      subtotal={current?.subtotal ?? subtotal}
      fee={fee}
      total={total}
      coupon={current?.coupon}
    />
  );

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Finaliser ma commande</h1>
          <p className="text-ink-500 hidden items-center gap-1.5 text-sm sm:flex">
            <Lock className="size-4" aria-hidden /> Paiement sécurisé
          </p>
        </div>
        <div className="lg:hidden">{summary}</div>

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
              fee !== null && (
                <>
                  À domicile, livraison prévue {when} · {fee === 0 ? "offerte" : formatFCFA(fee)}
                </>
              )
            }
          >
            {city && fee !== null && (
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
                    {fee === 0 ? <span className="text-forest-700">Offerte</span> : formatFCFA(fee)}
                  </p>
                </div>
                {remainingForFree > 0 && (
                  <p className="text-ink-700 text-sm">
                    Ajoutez {formatFCFA(remainingForFree)} d&apos;articles pour une livraison
                    offerte.{" "}
                    <Link href="/panier" className="text-brand-700 font-semibold underline">
                      Retour au panier
                    </Link>
                  </p>
                )}
                {quoteError && <FormAlert>{quoteError}</FormAlert>}
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
              {!current && quoteLoading && (
                <p className="text-ink-500 flex items-center gap-2 text-sm" role="status">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden /> Vérification des
                  moyens de paiement…
                </p>
              )}
              <fieldset className="space-y-2">
                <legend className="sr-only">Moyen de paiement</legend>
                {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => {
                  const disabled = !current || (m === "cod" ? !cod.allowed : !mobileMoneyAllowed);
                  const Icon = m === "cod" ? Wallet : Smartphone;
                  const why =
                    m === "cod"
                      ? cod.allowed
                        ? "Payez en espèces ou par Mobile Money à la réception."
                        : cod.reason || "Indisponible pour cette ville ou ce montant."
                      : mobileMoneyAllowed
                        ? "Vous validez le paiement sur votre téléphone avec votre code secret."
                        : "Bientôt disponible.";
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
                        <span className="text-ink-500">{why}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {method !== "cod" && mobileMoneyAllowed && (
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
                <SubmitButton pending={!current}>Continuer</SubmitButton>
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

              <div className="space-y-2">
                {current?.coupon ? (
                  <p className="text-forest-700 flex flex-wrap items-center gap-2" role="status">
                    <Tag className="size-4" aria-hidden />
                    Code <strong>{current.coupon.code}</strong> appliqué : −{" "}
                    {formatFCFA(current.coupon.discount)}
                    <button
                      type="button"
                      onClick={() => {
                        setCoupon(null);
                        setCouponError(null);
                      }}
                      className="text-ink-700 underline"
                    >
                      Retirer
                    </button>
                  </p>
                ) : (
                  <form onSubmit={applyCoupon} noValidate className="flex items-start gap-2">
                    <Field
                      label="Code promo"
                      className="flex-1 sm:max-w-xs"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      error={couponError}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={20}
                    />
                    <button
                      type="submit"
                      disabled={couponPending || couponInput.trim() === ""}
                      aria-busy={couponPending}
                      className="border-ink-200 hover:bg-ink-50 mt-7 flex h-12 items-center gap-2 rounded-full border-2 px-5 font-semibold disabled:opacity-60"
                    >
                      {couponPending && (
                        <LoaderCircle className="size-4 animate-spin" aria-hidden />
                      )}
                      Appliquer
                    </button>
                  </form>
                )}
              </div>

              {problem && (
                <FormAlert>
                  {problem.message}
                  {problem.link && (
                    <>
                      {" "}
                      <Link href={problem.link.href} className="font-semibold underline">
                        {problem.link.label}
                      </Link>
                    </>
                  )}
                </FormAlert>
              )}
              {quoteError && !problem && <FormAlert>{quoteError}</FormAlert>}
              <button
                type="button"
                onClick={submitOrder}
                disabled={pending || !quoteReady}
                aria-busy={pending || quoteLoading}
                className="bg-accent-400 hover:bg-accent-300 text-ink-900 flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-bold transition disabled:opacity-70 sm:max-w-md"
              >
                {(pending || quoteLoading) && (
                  <LoaderCircle className="size-5 animate-spin" aria-hidden />
                )}
                {method === "cod" ? "Confirmer la commande" : "Commander et payer"} ·{" "}
                {formatFCFA(total)}
              </button>
              <p className="text-ink-500 text-xs">
                En commandant, vous acceptez les{" "}
                <Link href="/infos/cgv" className="underline" target="_blank">
                  conditions générales de vente
                </Link>
                . Le montant est celui calculé par nos serveurs.
              </p>
            </div>
          </StepCard>
        </ol>
      </div>

      <div className="hidden lg:block">{summary}</div>
    </div>
  );
}
