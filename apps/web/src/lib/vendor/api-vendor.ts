import "server-only";
import {
  CLIENT_IP_HEADER,
  IDENTITY_ERROR_CODES,
  INTERNAL_KEY_HEADER,
  ORDER_ERROR_CODES,
  ORDER_REFERENCE_PATTERN,
  PRODUCT_IMAGE_LIMITS,
  ProblemDetailsSchema,
  SESSION_TOKEN_PATTERN,
  ShopSchema,
  VENDOR_ERROR_CODES,
  VendorKycSchema,
  VendorOrderPageSchema,
  VendorOrderSchema,
  VendorProductPageSchema,
  VendorProductSchema,
  type IdentityErrorCode,
  type KycDocumentKind,
  type KycRequest,
  type OrderErrorCode,
  type Shop,
  type ShopApplicationRequest,
  type VendorErrorCode,
  type VendorKyc,
  type VendorOrder,
  type VendorOrderPage,
  type VendorOrderStatus,
  type VendorProduct,
  type VendorProductContentRequest,
  type VendorProductCreateRequest,
  type VendorProductPage,
  type VendorProductStatus,
  type VendorVariantUpdateRequest,
} from "@kemdia/contracts";
import { z } from "zod";
import { readAtMost } from "@/lib/orders/api-orders";
import { isUuid, type UploadType } from "./images";
import { log } from "@/lib/log";

/**
 * Adaptateur « API » de l'espace vendeur (S6-T06, ADR-0037) : boutique (`/vendors/shop`), produits
 * (`/vendors/products`), photos (`/vendors/products/{id}/images`) et commandes (`/vendors/orders`, S6-T07, ADR-0038). Appelé par le SERVEUR du site seulement (clé
 * interne + jeton de session du cookie, `server-only`). Comme les autres adaptateurs :
 *
 * - chaque réponse est vérifiée par le schéma du contrat partagé ;
 * - erreur métier → son `code` (et, pour un champ mal rempli, l'explication de l'API) ; tout le reste → `INDISPONIBLE` ;
 * - les journaux ne contiennent ni jeton ni identifiant ni contenu : seulement la route et le statut.
 */

export type VendorFailureCode =
  IdentityErrorCode | VendorErrorCode | OrderErrorCode | "INDISPONIBLE";
export type VendorFailure = {
  ok: false;
  code: VendorFailureCode;
  /** Explication de l'API pour un champ mal rempli (`PRODUIT_INVALIDE`, `BOUTIQUE_INVALIDE`) */
  detail?: string;
  retryAfterSeconds?: number;
};
export type VendorResult<T> = { ok: true; data: T } | VendorFailure;

export interface VendorApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  /** Envoi d'une photo : l'API la réencode, cela peut prendre plus longtemps (15 s au plus côté API) */
  uploadTimeoutMs?: number;
  fetch?: typeof fetch;
  visitorIp?: () => Promise<string | null>;
}

const KNOWN_CODES: readonly VendorFailureCode[] = [
  ...IDENTITY_ERROR_CODES,
  ...VENDOR_ERROR_CODES,
  ...ORDER_ERROR_CODES,
];
/** Codes dont l'explication de l'API aide le vendeur à corriger son formulaire. */
const DETAILED: readonly VendorFailureCode[] = [
  "PRODUIT_INVALIDE",
  "BOUTIQUE_INVALIDE",
  "KYC_INVALIDE",
  "KYC_INCOMPLET",
];
const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const REFERENCE_IN_PATH = /KMD-[A-Z0-9]{6}/g;
const routeOf = (path: string) =>
  path.replace(UUID_IN_PATH, "{id}").replace(REFERENCE_IN_PATH, "{reference}").split("?")[0];

const isWebp = (bytes: Uint8Array) =>
  bytes.length >= 12 &&
  String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
  String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";

export type VendorImageResult =
  { status: 200; bytes: Uint8Array<ArrayBuffer> } | { status: 404 | 503 };

type Body = { json: object } | { bytes: Uint8Array<ArrayBuffer>; type: UploadType };

export function createVendorApi(options: VendorApiOptions) {
  const doFetch = options.fetch ?? fetch;

  async function headersFor(token: string, accept: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      accept,
      authorization: `Bearer ${token}`,
      [INTERNAL_KEY_HEADER]: options.key,
    };
    const ip = options.visitorIp ? await options.visitorIp().catch(() => null) : null;
    if (ip) headers[CLIENT_IP_HEADER] = ip;
    return headers;
  }

  async function call<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    token: string,
    schema: z.ZodType<T>,
    body?: Body,
  ): Promise<VendorResult<T>> {
    if (!SESSION_TOKEN_PATTERN.test(token)) return { ok: false, code: "SESSION_INVALIDE" };
    const headers = await headersFor(token, "application/json");
    let payloadOut: BodyInit | undefined;
    if (body && "json" in body) {
      headers["content-type"] = "application/json";
      payloadOut = JSON.stringify(body.json);
    } else if (body) {
      headers["content-type"] = body.type;
      payloadOut = body.bytes;
    }
    const upload = body !== undefined && "bytes" in body;

    let response: Response;
    try {
      response = await doFetch(`${options.url}/api/v1${path}`, {
        method,
        headers,
        body: payloadOut,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(
          upload ? (options.uploadTimeoutMs ?? options.timeoutMs * 4) : options.timeoutMs,
        ),
      });
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      log.error(
        "vendeur",
        `${method} ${routeOf(path)} : ${timeout ? "délai dépassé" : "API injoignable"}`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }

    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(payload);
      const code = problem.success ? problem.data.code : undefined;
      const known = KNOWN_CODES.find((c) => c === code);
      if (known) {
        const retry = Number(response.headers.get("retry-after"));
        const detail = problem.success ? problem.data.detail : undefined;
        return {
          ok: false,
          code: known,
          ...(DETAILED.includes(known) && detail ? { detail: detail.slice(0, 300) } : {}),
          ...(Number.isInteger(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}),
        };
      }
      log.error("vendeur", `${method} ${routeOf(path)} : statut ${response.status}`);
      return { ok: false, code: "INDISPONIBLE" };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".") || "(racine)").slice(0, 5);
      log.error(
        "vendeur",
        `${method} ${routeOf(path)} : réponse non conforme au contrat (${fields.join(", ")})`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }
    return { ok: true, data: parsed.data };
  }

  const missing = <T>(): Promise<VendorResult<T>> =>
    Promise.resolve({ ok: false, code: "PRODUIT_INTROUVABLE" });
  /** Identifiant vérifié (UUID) avant d'entrer dans une adresse : aucun chemin fabriqué. */
  const productPath = (productId: string) =>
    isUuid(productId) ? `/vendors/products/${productId.toLowerCase()}` : null;

  /** Référence vérifiée (KMD-XXXXXX) avant d'entrer dans une adresse. */
  const orderPath = (reference: string) =>
    ORDER_REFERENCE_PATTERN.test(reference) ? `/vendors/orders/${reference}` : null;
  const noOrder = <T>(): Promise<VendorResult<T>> =>
    Promise.resolve({ ok: false, code: "COMMANDE_INTROUVABLE" });

  return {
    // --- Boutique (S6-T01) ---
    shop: (token: string): Promise<VendorResult<Shop>> =>
      call("GET", "/vendors/shop", token, ShopSchema),
    applyShop: (token: string, request: ShopApplicationRequest): Promise<VendorResult<Shop>> =>
      call("POST", "/vendors/shop", token, ShopSchema, { json: request }),

    // --- Produits (S6-T02) ---
    products: (
      token: string,
      params: { status?: VendorProductStatus; after?: string; limit?: number },
    ): Promise<VendorResult<VendorProductPage>> => {
      const query = new URLSearchParams();
      if (params.status) query.set("status", params.status);
      if (params.after) query.set("after", params.after);
      if (params.limit) query.set("limit", String(params.limit));
      const text = query.toString();
      return call(
        "GET",
        `/vendors/products${text ? `?${text}` : ""}`,
        token,
        VendorProductPageSchema,
      );
    },
    product: (token: string, productId: string): Promise<VendorResult<VendorProduct>> => {
      const path = productPath(productId);
      return path ? call("GET", path, token, VendorProductSchema) : missing();
    },
    createProduct: (
      token: string,
      request: VendorProductCreateRequest,
    ): Promise<VendorResult<VendorProduct>> =>
      call("POST", "/vendors/products", token, VendorProductSchema, { json: request }),
    updateContent: (
      token: string,
      productId: string,
      request: VendorProductContentRequest,
    ): Promise<VendorResult<VendorProduct>> => {
      const path = productPath(productId);
      return path ? call("PUT", path, token, VendorProductSchema, { json: request }) : missing();
    },
    updateVariant: (
      token: string,
      productId: string,
      variantId: string,
      request: VendorVariantUpdateRequest,
    ): Promise<VendorResult<VendorProduct>> => {
      const path = productPath(productId);
      if (!path || !isUuid(variantId)) return missing();
      return call(
        "PATCH",
        `${path}/variants/${variantId.toLowerCase()}`,
        token,
        VendorProductSchema,
        { json: request },
      );
    },
    archive: (token: string, productId: string): Promise<VendorResult<VendorProduct>> => {
      const path = productPath(productId);
      return path ? call("POST", `${path}/archive`, token, VendorProductSchema) : missing();
    },
    restore: (token: string, productId: string): Promise<VendorResult<VendorProduct>> => {
      const path = productPath(productId);
      return path ? call("POST", `${path}/restore`, token, VendorProductSchema) : missing();
    },

    // --- Photos (S6-T04) ---
    addImage: (
      token: string,
      productId: string,
      bytes: Uint8Array<ArrayBuffer>,
      type: UploadType,
    ): Promise<VendorResult<VendorProduct>> => {
      const path = productPath(productId);
      return path
        ? call("POST", `${path}/images`, token, VendorProductSchema, { bytes, type })
        : missing();
    },
    reorderImages: (
      token: string,
      productId: string,
      images: string[],
    ): Promise<VendorResult<VendorProduct>> => {
      const path = productPath(productId);
      return path
        ? call("PUT", `${path}/images`, token, VendorProductSchema, { json: { images } })
        : missing();
    },
    removeImage: (
      token: string,
      productId: string,
      imageId: string,
    ): Promise<VendorResult<VendorProduct>> => {
      const path = productPath(productId);
      if (!path || !isUuid(imageId)) return missing();
      return call("DELETE", `${path}/images/${imageId.toLowerCase()}`, token, VendorProductSchema);
    },

    // --- Commandes de SA boutique (S6-T07, BR-013) ---
    orders: (
      token: string,
      params: { status?: VendorOrderStatus; before?: string; limit?: number },
    ): Promise<VendorResult<VendorOrderPage>> => {
      const query = new URLSearchParams();
      if (params.status) query.set("status", params.status);
      if (params.before) query.set("before", params.before);
      if (params.limit) query.set("limit", String(params.limit));
      const text = query.toString();
      return call("GET", `/vendors/orders${text ? `?${text}` : ""}`, token, VendorOrderPageSchema);
    },
    order: (token: string, reference: string): Promise<VendorResult<VendorOrder>> => {
      const path = orderPath(reference);
      return path ? call("GET", path, token, VendorOrderSchema) : noOrder();
    },
    acceptOrder: (token: string, reference: string): Promise<VendorResult<VendorOrder>> => {
      const path = orderPath(reference);
      return path ? call("POST", `${path}/accept`, token, VendorOrderSchema) : noOrder();
    },
    refuseOrder: (
      token: string,
      reference: string,
      reason: string,
    ): Promise<VendorResult<VendorOrder>> => {
      const path = orderPath(reference);
      return path
        ? call("POST", `${path}/refuse`, token, VendorOrderSchema, { json: { reason } })
        : noOrder();
    },
    // --- Dossier de vérification, KYC (S6-T08, BR-024) ---
    kyc: (token: string): Promise<VendorResult<VendorKyc>> =>
      call("GET", "/vendors/kyc", token, VendorKycSchema),
    saveKyc: (token: string, request: KycRequest): Promise<VendorResult<VendorKyc>> =>
      call("PUT", "/vendors/kyc", token, VendorKycSchema, { json: request }),
    uploadKycDocument: (
      token: string,
      kind: KycDocumentKind,
      bytes: Uint8Array<ArrayBuffer>,
      type: UploadType,
    ): Promise<VendorResult<VendorKyc>> =>
      call("POST", `/vendors/kyc/documents/${kind}`, token, VendorKycSchema, { bytes, type }),
    submitKyc: (token: string): Promise<VendorResult<VendorKyc>> =>
      call("POST", "/vendors/kyc/submit", token, VendorKycSchema),
    /** Aperçu d'une photo de SON produit (quel que soit le statut) : seulement un WebP vérifié de 2 Mo au plus. */
    async image(token: string, productId: string, imageId: string): Promise<VendorImageResult> {
      const path = productPath(productId);
      if (!path || !isUuid(imageId) || !SESSION_TOKEN_PATTERN.test(token)) return { status: 404 };
      let response: Response;
      try {
        response = await doFetch(`${options.url}/api/v1${path}/images/${imageId.toLowerCase()}`, {
          headers: await headersFor(token, "image/webp"),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(options.timeoutMs),
        });
      } catch {
        log.error("vendeur", "aperçu de photo : API injoignable");
        return { status: 503 };
      }
      if ([401, 403, 404].includes(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        return { status: 404 };
      }
      const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      if (response.status !== 200 || type !== "image/webp") {
        await response.body?.cancel().catch(() => undefined);
        log.error("vendeur", `aperçu de photo : statut ${response.status}`);
        return { status: 503 };
      }
      const bytes = await readAtMost(response, PRODUCT_IMAGE_LIMITS.maxStoredBytes).catch(
        () => null,
      );
      if (!bytes || !isWebp(bytes)) {
        log.error("vendeur", "aperçu de photo : fichier non conforme");
        return { status: 503 };
      }
      return { status: 200, bytes };
    },
  };
}

export type VendorApi = ReturnType<typeof createVendorApi>;
