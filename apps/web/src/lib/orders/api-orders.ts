import "server-only";
import {
  CLIENT_IP_HEADER,
  COUPON_ERROR_CODES,
  CustomerShipmentSchema,
  INTERNAL_KEY_HEADER,
  INVOICE_NUMBER_PATTERN,
  InvoiceListSchema,
  ORDER_CURSOR_PATTERN,
  ORDER_ERROR_CODES,
  ORDER_REFERENCE_PATTERN,
  OrderPageSchema,
  OrderQuoteSchema,
  OrderSchema,
  PaymentSchema,
  ProblemDetailsSchema,
  SESSION_TOKEN_PATTERN,
  type CreateOrderRequest,
  type CustomerShipment,
  type InvoiceList,
  type Order,
  type OrderPage,
  type OrderQuote,
  type Payment,
} from "@kemdia/contracts";
import { z } from "zod";

/**
 * Adaptateur « API » des commandes, paiements et factures (S5-T07, ADR-0029) : appelle `/api/v1/orders/*` depuis le
 * serveur du site uniquement (clé interne + jeton de session, `server-only`), comme `api-cart.ts` :
 *
 * - chaque réponse est vérifiée par le schéma du contrat partagé ;
 * - erreur métier → son `code` ; session refusée → `SESSION_INVALIDE` ; tout le reste → `INDISPONIBLE` ;
 * - les journaux ne contiennent ni jeton, ni numéro de commande, ni adresse : seulement la route et le statut.
 */

/** Codes de paiement que le site affiche (les autres codes du module payments ne concernent pas le client). */
const PAYMENT_CODES = [
  "PAIEMENT_IMPOSSIBLE",
  "PAIEMENT_EN_COURS",
  "TROP_D_ESSAIS_PAIEMENT",
  "PAIEMENT_INDISPONIBLE",
  "PAIEMENT_INTROUVABLE",
  "FACTURE_INTROUVABLE",
] as const;

export type OrderFailureCode =
  | (typeof ORDER_ERROR_CODES)[number]
  | (typeof COUPON_ERROR_CODES)[number]
  | (typeof PAYMENT_CODES)[number]
  | "PANIER_OCCUPE"
  | "SESSION_INVALIDE"
  | "TROP_DE_REQUETES"
  // Pas encore remise au transporteur (S7-T02)
  | "EXPEDITION_INTROUVABLE"
  | "INDISPONIBLE";
export type OrderApiResult<T> = { ok: true; data: T } | { ok: false; code: OrderFailureCode };

const KNOWN_CODES: ReadonlySet<string> = new Set<OrderFailureCode>([
  ...ORDER_ERROR_CODES,
  ...COUPON_ERROR_CODES,
  ...PAYMENT_CODES,
  "PANIER_OCCUPE",
  "SESSION_INVALIDE",
  "TROP_DE_REQUETES",
  "EXPEDITION_INTROUVABLE",
]);

export interface OrdersApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  /** Adresse du visiteur de la requête en cours (S4-T07), transmise avec la clé interne */
  visitorIp?: () => Promise<string | null>;
}

/** PDF d'une facture : 2 Mo au plus (une facture fait quelques dizaines de Ko). */
export const INVOICE_PDF_MAX_BYTES = 2_000_000;

export const isOrderReference = (value: unknown): value is string =>
  typeof value === "string" && ORDER_REFERENCE_PATTERN.test(value);
export const isInvoiceNumber = (value: unknown): value is string =>
  typeof value === "string" && INVOICE_NUMBER_PATTERN.test(value);
export const isOrderCursor = (value: unknown): value is string =>
  typeof value === "string" && ORDER_CURSOR_PATTERN.test(value);

type Method = "GET" | "POST";

export function createOrdersApi(options: OrdersApiOptions) {
  const doFetch = options.fetch ?? fetch;

  async function send(
    method: Method,
    path: string,
    token: string,
    accept: string,
    body?: object,
  ): Promise<{ ok: true; response: Response } | { ok: false; code: OrderFailureCode }> {
    // Un jeton mal formé n'est même pas envoyé
    if (!SESSION_TOKEN_PATTERN.test(token)) return { ok: false, code: "SESSION_INVALIDE" };
    const headers: Record<string, string> = {
      accept,
      authorization: `Bearer ${token}`,
      [INTERNAL_KEY_HEADER]: options.key,
    };
    if (body) headers["content-type"] = "application/json";
    const ip = options.visitorIp ? await options.visitorIp().catch(() => null) : null;
    if (ip) headers[CLIENT_IP_HEADER] = ip;
    try {
      const response = await doFetch(`${options.url}/api/v1/orders${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      return { ok: true, response };
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      console.error(
        `[commandes] ${method} ${routeOf(path)} : ${timeout ? "délai dépassé" : "API injoignable"}`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }
  }

  async function failure(method: Method, path: string, response: Response) {
    const payload: unknown = await response.json().catch(() => undefined);
    const problem = ProblemDetailsSchema.safeParse(payload);
    if (problem.success && problem.data.code && KNOWN_CODES.has(problem.data.code)) {
      return { ok: false as const, code: problem.data.code as OrderFailureCode };
    }
    console.error(`[commandes] ${method} ${routeOf(path)} : statut ${response.status}`);
    return { ok: false as const, code: "INDISPONIBLE" as const };
  }

  async function call<T>(
    method: Method,
    path: string,
    token: string,
    schema: z.ZodType<T>,
    body?: object,
  ): Promise<OrderApiResult<T>> {
    const sent = await send(method, path, token, "application/json", body);
    if (!sent.ok) return sent;
    const { response } = sent;
    if (!response.ok) return failure(method, path, response);
    const payload: unknown = await response.json().catch(() => undefined);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".") || "(racine)").slice(0, 5);
      console.error(
        `[commandes] ${method} ${routeOf(path)} : réponse non conforme au contrat (${fields.join(", ")})`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }
    return { ok: true, data: parsed.data };
  }

  /** Les identifiants sont revérifiés ici aussi : rien d'inattendu n'entre dans l'adresse appelée. */
  const orderPath = (reference: string) => {
    if (!isOrderReference(reference)) throw new TypeError("numéro de commande invalide");
    return `/${reference}`;
  };

  return {
    quote: (
      token: string,
      cityId: string,
      couponCode?: string,
    ): Promise<OrderApiResult<OrderQuote>> =>
      call("POST", "/quote", token, OrderQuoteSchema, {
        cityId,
        ...(couponCode ? { couponCode } : {}),
      }),
    create: (token: string, request: CreateOrderRequest): Promise<OrderApiResult<Order>> =>
      call("POST", "", token, OrderSchema, request),
    list: (token: string, before?: string): Promise<OrderApiResult<OrderPage>> =>
      call(
        "GET",
        before && isOrderCursor(before) ? `?before=${encodeURIComponent(before)}` : "",
        token,
        OrderPageSchema,
      ),
    get: (token: string, reference: string): Promise<OrderApiResult<Order>> =>
      call("GET", orderPath(reference), token, OrderSchema),
    /** Livraison de la commande (S7-T02) : état et étapes, sans le motif écrit par l'équipe. */
    shipment: (token: string, reference: string): Promise<OrderApiResult<CustomerShipment>> =>
      call("GET", `${orderPath(reference)}/shipment`, token, CustomerShipmentSchema),
    cancel: (token: string, reference: string): Promise<OrderApiResult<Order>> =>
      call("POST", `${orderPath(reference)}/cancel`, token, OrderSchema),
    /** Demande (ou redemande) la validation sur le téléphone ; `phone` : autre numéro du même opérateur. */
    startPayment: (
      token: string,
      reference: string,
      phone?: string,
    ): Promise<OrderApiResult<Payment>> =>
      call(
        "POST",
        `${orderPath(reference)}/payments`,
        token,
        PaymentSchema,
        phone ? { phone } : {},
      ),
    latestPayment: (token: string, reference: string): Promise<OrderApiResult<Payment>> =>
      call("GET", `${orderPath(reference)}/payments`, token, PaymentSchema),
    invoices: (token: string, reference: string): Promise<OrderApiResult<InvoiceList>> =>
      call("GET", `${orderPath(reference)}/invoices`, token, InvoiceListSchema),
    /** Le PDF d'une facture ou d'un avoir de la commande (le compte connecté seulement, sinon introuvable). */
    async invoicePdf(
      token: string,
      reference: string,
      number: string,
    ): Promise<OrderApiResult<Uint8Array<ArrayBuffer>>> {
      if (!isInvoiceNumber(number)) return { ok: false, code: "FACTURE_INTROUVABLE" };
      const path = `${orderPath(reference)}/invoices/${number}`;
      const sent = await send("GET", path, token, "application/pdf");
      if (!sent.ok) return sent;
      const { response } = sent;
      if (!response.ok) return failure("GET", path, response);
      const type = response.headers.get("content-type") ?? "";
      const length = Number(response.headers.get("content-length") ?? "0");
      if (!type.startsWith("application/pdf") || length > INVOICE_PDF_MAX_BYTES) {
        console.error("[commandes] GET /{commande}/invoices/{numéro} : réponse inattendue");
        return { ok: false, code: "INDISPONIBLE" };
      }
      // Lu par morceaux, arrêté dès 2 Mo : une réponse sans taille annoncée ne peut pas remplir la mémoire
      const bytes = await readAtMost(response, INVOICE_PDF_MAX_BYTES);
      // « %PDF- » au début
      const isPdf =
        bytes !== null &&
        bytes.length > 5 &&
        String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
      if (!isPdf) {
        console.error("[commandes] GET /{commande}/invoices/{numéro} : fichier non conforme");
        return { ok: false, code: "INDISPONIBLE" };
      }
      return { ok: true, data: bytes };
    },
  };
}

/** Corps de la réponse, ou `null` s'il dépasse `max` octets (lecture interrompue aussitôt). */
export async function readAtMost(
  response: Response,
  max: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Route sans numéro de commande ni de facture (les journaux ne disent pas qui commande quoi). */
function routeOf(path: string): string {
  return (
    path
      .replace(/^\/KMD-[A-Z0-9]{6}/, "/{commande}")
      .replace(/\/KMD-[FA]-\d{4}-\d{6}$/, "/{numéro}")
      .replace(/\?.*$/, "") || "/"
  );
}

export type OrdersApi = ReturnType<typeof createOrdersApi>;
