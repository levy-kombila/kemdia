"use server";

import { COUPON_CODE_PATTERN, PAYMENT_METHODS, UUID_PATTERN } from "@kemdia/contracts/constants";
import type { CreateOrderRequest, OrderQuote } from "@kemdia/contracts";
import { refresh } from "next/cache";
import { z } from "zod";
import { isOrderReference, type OrderFailureCode } from "./api-orders";
import { orderMessage } from "./order-messages";
import { ordersApi, sessionToken } from "./orders";

/**
 * Actions serveur du tunnel de commande et de « Mes commandes » (S5-T07, ADR-0029). Ce sont des points d'entrée
 * publics : chaque argument est revérifié ici (forme et longueur), puis l'API refait TOUTES les règles (compte
 * connecté, prix et stock du serveur, BR-004, BR-012). Le jeton de session reste dans son cookie `HttpOnly`.
 */

type Failure = { ok: false; code: OrderFailureCode; message: string };
const fail = (code: OrderFailureCode): Failure => ({
  ok: false,
  code,
  message: orderMessage(code),
});

const couponField = z.string().trim().regex(COUPON_CODE_PATTERN);

export type QuoteResult = { ok: true; quote: OrderQuote } | Failure;

/** Total du serveur pour une ville (et un code promo) : frais de livraison, remise, moyens de paiement possibles. */
export async function quoteOrder(cityId: unknown, couponCode?: unknown): Promise<QuoteResult> {
  if (typeof cityId !== "string" || cityId.length === 0 || cityId.length > 40) {
    return fail("ADRESSE_INVALIDE");
  }
  let coupon: string | undefined;
  if (couponCode !== undefined && couponCode !== "") {
    const parsed = couponField.safeParse(couponCode);
    // Un code mal formé n'est pas envoyé : même réponse qu'un code inconnu
    if (!parsed.success) return fail("COUPON_INVALIDE");
    coupon = parsed.data;
  }
  const token = await sessionToken();
  if (!token) return fail("SESSION_INVALIDE");
  const result = await ordersApi().quote(token, cityId, coupon);
  return result.ok ? { ok: true, quote: result.data } : fail(result.code);
}

const PlaceOrderInput = z.strictObject({
  idempotencyKey: z.string().length(36).regex(UUID_PATTERN),
  expectedTotal: z.int().nonnegative().max(1_000_000_000),
  delivery: z.strictObject({
    fullName: z.string().max(120),
    phone: z.string().max(30),
    cityId: z.string().max(40),
    neighborhood: z.string().max(80),
    landmark: z.string().max(400),
  }),
  couponCode: couponField.optional(),
  payment: z.strictObject({
    method: z.enum(PAYMENT_METHODS),
    phone: z.string().max(30).optional(),
  }),
});

export type PlaceOrderResult =
  /** `paymentError` : la commande existe, mais la demande de paiement n'est pas partie (à refaire depuis la commande) */
  { ok: true; reference: string; paymentError?: OrderFailureCode } | Failure;

/**
 * Passe la commande du panier du compte, puis — Mobile Money — envoie aussitôt la demande de validation sur le
 * téléphone. Renvoyée avec la même clé (réseau coupé, double clic), l'API rend la commande déjà créée, jamais une
 * deuxième ; la demande de paiement n'est alors pas renvoyée si elle est déjà en attente (`PAIEMENT_EN_COURS`).
 */
export async function placeOrder(input: unknown): Promise<PlaceOrderResult> {
  const parsed = PlaceOrderInput.safeParse(input);
  if (!parsed.success) return fail("ADRESSE_INVALIDE");
  const token = await sessionToken();
  if (!token) return fail("SESSION_INVALIDE");
  const request: CreateOrderRequest = {
    ...parsed.data,
    idempotencyKey: parsed.data.idempotencyKey.toLowerCase(),
  };
  const created = await ordersApi().create(token, request);
  if (!created.ok) return fail(created.code);
  const order = created.data;
  if (order.status !== "pending_payment") return { ok: true, reference: order.reference };

  const started = await ordersApi().startPayment(token, order.reference);
  if (started.ok || started.code === "PAIEMENT_EN_COURS") {
    return { ok: true, reference: order.reference };
  }
  return { ok: true, reference: order.reference, paymentError: started.code };
}

export type OrderActionState = { tone: "success" | "error"; message: string } | null;

const PHONE_FIELD = /^[0-9 +.-]{8,20}$/;

/** « Réessayer » sur la page de la commande : nouvelle demande de validation (3 essais au plus, côté API). */
export async function retryPayment(
  _previous: OrderActionState,
  form: FormData,
): Promise<OrderActionState> {
  const reference = form.get("reference");
  const phone = form.get("phone");
  if (!isOrderReference(reference)) return { tone: "error", message: orderMessage("INDISPONIBLE") };
  if (phone !== null && (typeof phone !== "string" || (phone !== "" && !PHONE_FIELD.test(phone)))) {
    return { tone: "error", message: orderMessage("NUMERO_PAIEMENT_INVALIDE") };
  }
  const token = await sessionToken();
  if (!token) return { tone: "error", message: orderMessage("SESSION_INVALIDE") };
  const result = await ordersApi().startPayment(token, reference, phone ? phone : undefined);
  // L'état de la commande change dans tous les cas (nouvel essai, ou essai précédent expiré)
  refresh();
  if (!result.ok) return { tone: "error", message: orderMessage(result.code) };
  return { tone: "success", message: "Demande envoyée : validez le paiement sur votre téléphone." };
}

/** Annulation par le client, avant l'expédition (l'API vérifie le compte et le statut). */
export async function cancelOrder(
  _previous: OrderActionState,
  form: FormData,
): Promise<OrderActionState> {
  const reference = form.get("reference");
  if (!isOrderReference(reference)) return { tone: "error", message: orderMessage("INDISPONIBLE") };
  const token = await sessionToken();
  if (!token) return { tone: "error", message: orderMessage("SESSION_INVALIDE") };
  const result = await ordersApi().cancel(token, reference);
  refresh();
  if (!result.ok) return { tone: "error", message: orderMessage(result.code) };
  return {
    tone: "success",
    message: "Commande annulée. Les articles sont remis en vente.",
  };
}
