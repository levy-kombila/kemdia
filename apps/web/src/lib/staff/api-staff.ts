import "server-only";
import {
  AdminKycPageSchema,
  AdminKycSchema,
  AdminShopPageSchema,
  AdminShopSchema,
  CLIENT_IP_HEADER,
  DeliveryTariffsSchema,
  ReadyOrderListSchema,
  SHIPPING_ERROR_CODES,
  ShipmentListSchema,
  ShipmentSchema,
  type DeliveryTariffs,
  type DeliveryTariffsRequest,
  type ReadyOrderList,
  type Shipment,
  type ShipmentList,
  type ShipmentStatus,
  type ShippingErrorCode,
  IDENTITY_ERROR_CODES,
  INTERNAL_KEY_HEADER,
  ModerationProductPageSchema,
  ModerationProductSchema,
  PRODUCT_IMAGE_LIMITS,
  ProblemDetailsSchema,
  RecoveryCodesSchema,
  SESSION_TOKEN_PATTERN,
  SecondFactorEnabledSchema,
  SecondFactorSetupSchema,
  SecondFactorStatusSchema,
  SecondFactorVerifiedSchema,
  VENDOR_ERROR_CODES,
  type AdminKyc,
  type AdminKycPage,
  type AdminShop,
  type AdminShopPage,
  type KycDocumentKind,
  type KycStatus,
  type IdentityErrorCode,
  type ModerationProduct,
  type ModerationProductPage,
  type RecoveryCodes,
  type SecondFactorEnabled,
  type SecondFactorSetup,
  type SecondFactorStatus,
  type SecondFactorVerified,
  type ShopStatus,
  type VendorErrorCode,
} from "@kemdia/contracts";
import { z } from "zod";
import { readAtMost } from "@/lib/orders/api-orders";

/**
 * Adaptateur « API » de l'espace de l'équipe (S6-T05, ADR-0036) : double authentification (`/auth/2fa`), boutiques
 * (`/admin/shops`) et modération (`/moderation/products`). Appelé par le SERVEUR du site seulement (clé interne + jeton
 * de session, `server-only`). Même principe que les autres adaptateurs :
 *
 * - chaque réponse est vérifiée par le schéma du contrat partagé ;
 * - erreur métier de l'API → son `code` ; tout le reste → `INDISPONIBLE` ;
 * - les journaux ne contiennent ni jeton, ni mot de passe, ni code, ni secret : seulement la route et le statut.
 */

/** S7-T02 : codes des livraisons, et deux codes des commandes renvoyés par ces routes. */
export type StaffOrderCode = "COMMANDE_INTROUVABLE" | "PANIER_OCCUPE";
export type StaffFailureCode =
  IdentityErrorCode | VendorErrorCode | ShippingErrorCode | StaffOrderCode | "INDISPONIBLE";
export type StaffFailure = { ok: false; code: StaffFailureCode; retryAfterSeconds?: number };
export type StaffResult<T> = { ok: true; data: T } | StaffFailure;

export interface StaffApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  /** Adresse du visiteur de la requête en cours (S4-T07), transmise avec la clé interne */
  visitorIp?: () => Promise<string | null>;
}

const KNOWN_CODES: readonly StaffFailureCode[] = [
  ...IDENTITY_ERROR_CODES,
  ...VENDOR_ERROR_CODES,
  ...SHIPPING_ERROR_CODES,
  "COMMANDE_INTROUVABLE",
  "PANIER_OCCUPE",
];
/** Numéro de commande (« KMD-7F3K9Q ») : vérifié avant de construire l'adresse de l'API. */
const ORDER_REFERENCE = /^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route lisible dans les journaux : jamais d'identifiant. */
function routeOf(path: string): string {
  return path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "{id}");
}

const isWebp = (bytes: Uint8Array) =>
  bytes.length >= 12 &&
  String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
  String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";

export type StaffImageResult =
  { status: 200; bytes: Uint8Array<ArrayBuffer> } | { status: 403 | 404 | 503 };

export function createStaffApi(options: StaffApiOptions) {
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
    method: "GET" | "POST" | "PUT",
    path: string,
    token: string,
    schema: z.ZodType<T>,
    body?: object,
  ): Promise<StaffResult<T>> {
    // Un jeton mal formé n'est même pas envoyé
    if (!SESSION_TOKEN_PATTERN.test(token)) return { ok: false, code: "SESSION_INVALIDE" };
    const headers = await headersFor(token, "application/json");
    if (body) headers["content-type"] = "application/json";

    let response: Response;
    try {
      response = await doFetch(`${options.url}/api/v1${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      console.error(
        `[équipe] ${method} ${routeOf(path)} : ${timeout ? "délai dépassé" : "API injoignable"}`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }

    const payload: unknown =
      response.status === 204 ? undefined : await response.json().catch(() => undefined);

    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(payload);
      const code = problem.success ? problem.data.code : undefined;
      const known = KNOWN_CODES.find((c) => c === code);
      if (known) {
        const retry = Number(response.headers.get("retry-after"));
        return {
          ok: false,
          code: known,
          ...(Number.isInteger(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}),
        };
      }
      console.error(`[équipe] ${method} ${routeOf(path)} : statut ${response.status}`);
      return { ok: false, code: "INDISPONIBLE" };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      // Chemins des champs seulement : jamais les valeurs reçues dans le journal
      const fields = parsed.error.issues.map((i) => i.path.join(".") || "(racine)").slice(0, 5);
      console.error(
        `[équipe] ${method} ${routeOf(path)} : réponse non conforme au contrat (${fields.join(", ")})`,
      );
      return { ok: false, code: "INDISPONIBLE" };
    }
    return { ok: true, data: parsed.data };
  }

  const id = (value: string) => (UUID.test(value) ? value.toLowerCase() : null);

  /**
   * Image relayée seulement si c'est bien un WebP d'au plus `maxBytes`. 403 : session sans droit ou double
   * authentification à confirmer ; 404 : image inconnue ; 503 : tout le reste.
   */
  async function fetchImage(
    token: string,
    path: string,
    maxBytes: number,
    what: string,
  ): Promise<StaffImageResult> {
    if (!SESSION_TOKEN_PATTERN.test(token)) return { status: 403 };
    let response: Response;
    try {
      response = await doFetch(`${options.url}/api/v1${path}`, {
        headers: await headersFor(token, "image/webp"),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      console.error(`[équipe] ${what} : API injoignable`);
      return { status: 503 };
    }
    if (response.status === 404 || response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      return { status: response.status === 404 ? 404 : 403 };
    }
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (response.status !== 200 || type !== "image/webp") {
      await response.body?.cancel().catch(() => undefined);
      console.error(`[équipe] ${what} : statut ${response.status}`);
      return { status: 503 };
    }
    const bytes = await readAtMost(response, maxBytes).catch(() => null);
    if (!bytes || !isWebp(bytes)) {
      console.error(`[équipe] ${what} : fichier non conforme`);
      return { status: 503 };
    }
    return { status: 200, bytes };
  }
  const notFound = <T>(code: StaffFailureCode): StaffResult<T> => ({ ok: false, code });

  function listQuery(params: { status?: string; after?: string; limit?: number }): string {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.after) query.set("after", params.after);
    if (params.limit) query.set("limit", String(params.limit));
    const text = query.toString();
    return text ? `?${text}` : "";
  }

  return {
    // --- Double authentification (S6-T03) ---
    secondFactor: (token: string): Promise<StaffResult<SecondFactorStatus>> =>
      call("GET", "/auth/2fa", token, SecondFactorStatusSchema),
    setupSecondFactor: (token: string, password: string): Promise<StaffResult<SecondFactorSetup>> =>
      call("POST", "/auth/2fa/setup", token, SecondFactorSetupSchema, { password }),
    enableSecondFactor: (token: string, code: string): Promise<StaffResult<SecondFactorEnabled>> =>
      call("POST", "/auth/2fa/enable", token, SecondFactorEnabledSchema, { code }),
    verifySecondFactor: (token: string, code: string): Promise<StaffResult<SecondFactorVerified>> =>
      call("POST", "/auth/2fa/verify", token, SecondFactorVerifiedSchema, { code }),
    regenerateRecoveryCodes: (token: string, code: string): Promise<StaffResult<RecoveryCodes>> =>
      call("POST", "/auth/2fa/recovery-codes", token, RecoveryCodesSchema, { code }),

    // --- Boutiques (S6-T01, administrateurs) ---
    shops: (
      token: string,
      params: { status?: ShopStatus; after?: string; limit?: number },
    ): Promise<StaffResult<AdminShopPage>> =>
      call("GET", `/admin/shops${listQuery(params)}`, token, AdminShopPageSchema),
    shop: (token: string, shopId: string): Promise<StaffResult<AdminShop>> => {
      const shop = id(shopId);
      return shop
        ? call("GET", `/admin/shops/${shop}`, token, AdminShopSchema)
        : Promise.resolve(notFound("BOUTIQUE_INTROUVABLE"));
    },
    decideShop: (
      token: string,
      shopId: string,
      decision: "approve" | "reject" | "suspend",
      reason?: string,
    ): Promise<StaffResult<AdminShop>> => {
      const shop = id(shopId);
      if (!shop) return Promise.resolve(notFound("BOUTIQUE_INTROUVABLE"));
      return call(
        "POST",
        `/admin/shops/${shop}/${decision}`,
        token,
        AdminShopSchema,
        decision === "approve" ? undefined : { reason: reason ?? "" },
      );
    },

    // --- Modération des produits (S6-T02, modérateurs et administrateurs) ---
    moderationQueue: (
      token: string,
      params: { status?: "pending" | "published" | "rejected"; after?: string; limit?: number },
    ): Promise<StaffResult<ModerationProductPage>> =>
      call("GET", `/moderation/products${listQuery(params)}`, token, ModerationProductPageSchema),
    moderationProduct: (
      token: string,
      productId: string,
    ): Promise<StaffResult<ModerationProduct>> => {
      const product = id(productId);
      return product
        ? call("GET", `/moderation/products/${product}`, token, ModerationProductSchema)
        : Promise.resolve(notFound("PRODUIT_INTROUVABLE"));
    },
    decideProduct: (
      token: string,
      productId: string,
      decision: "approve" | "reject",
      submittedAt: string,
      reason?: string,
    ): Promise<StaffResult<ModerationProduct>> => {
      const product = id(productId);
      if (!product) return Promise.resolve(notFound("PRODUIT_INTROUVABLE"));
      return call(
        "POST",
        `/moderation/products/${product}/${decision}`,
        token,
        ModerationProductSchema,
        decision === "approve" ? { submittedAt } : { submittedAt, reason: reason ?? "" },
      );
    },

    /**
     * Photo d'un produit à modérer (S6-T04) : relayée seulement si c'est bien un WebP de 2 Mo au plus. 403 : session
     * sans droit ou double authentification à confirmer ; 404 : photo inconnue ; 503 : tout le reste.
     */
    moderationImage(token: string, productId: string, imageId: string): Promise<StaffImageResult> {
      const product = id(productId);
      const image = id(imageId);
      if (!product || !image) return Promise.resolve({ status: 404 });
      return fetchImage(
        token,
        `/moderation/products/${product}/images/${image}`,
        PRODUCT_IMAGE_LIMITS.maxStoredBytes,
        "photo à modérer",
      );
    },
    // --- Vérification des vendeurs, KYC (S6-T08) : administrateurs seulement ---
    kycList: (
      token: string,
      params: { status?: Exclude<KycStatus, "draft">; after?: string; limit?: number },
    ): Promise<StaffResult<AdminKycPage>> =>
      call("GET", `/admin/kyc${listQuery(params)}`, token, AdminKycPageSchema),
    /** Dossier complet : la consultation est inscrite au journal d'audit par l'API. */
    kyc: (token: string, shopId: string): Promise<StaffResult<AdminKyc>> => {
      const shop = id(shopId);
      return shop
        ? call("GET", `/admin/kyc/${shop}`, token, AdminKycSchema)
        : Promise.resolve(notFound("KYC_INTROUVABLE"));
    },
    decideKyc: (
      token: string,
      shopId: string,
      decision: "approve" | "reject",
      reason?: string,
    ): Promise<StaffResult<undefined>> => {
      const shop = id(shopId);
      if (!shop) return Promise.resolve(notFound("KYC_INTROUVABLE"));
      return call(
        "POST",
        `/admin/kyc/${shop}/${decision}`,
        token,
        z.undefined(),
        decision === "approve" ? undefined : { reason: reason ?? "" },
      );
    },
    // --- Livraisons (S7-T02, administrateurs) ---
    readyOrders: (token: string): Promise<StaffResult<ReadyOrderList>> =>
      call("GET", "/admin/shipping/ready", token, ReadyOrderListSchema),
    shipments: (token: string, status: ShipmentStatus): Promise<StaffResult<ShipmentList>> =>
      call("GET", `/admin/shipping/shipments?status=${status}`, token, ShipmentListSchema),
    shipment: (token: string, reference: string): Promise<StaffResult<Shipment>> =>
      ORDER_REFERENCE.test(reference)
        ? call("GET", `/admin/shipping/shipments/${reference}`, token, ShipmentSchema)
        : Promise.resolve(notFound("EXPEDITION_INTROUVABLE")),
    /** Étape d'une livraison ; motif (échec) ou note (annulation) vérifiés à nouveau par l'API. */
    shipmentStep: (
      token: string,
      reference: string,
      step: "hand-over" | "delivered" | "failed" | "retry" | "cancel",
      text?: string,
    ): Promise<StaffResult<Shipment>> => {
      if (!ORDER_REFERENCE.test(reference))
        return Promise.resolve(notFound("COMMANDE_INTROUVABLE"));
      const body =
        step === "failed" ? { reason: text ?? "" } : step === "cancel" ? { note: text ?? "" } : {};
      return call(
        "POST",
        `/admin/shipping/shipments/${reference}/${step}`,
        token,
        ShipmentSchema,
        body,
      );
    },
    tariffs: (token: string): Promise<StaffResult<DeliveryTariffs>> =>
      call("GET", "/admin/shipping/tariffs", token, DeliveryTariffsSchema),
    updateTariffs: (
      token: string,
      tariffs: DeliveryTariffsRequest,
    ): Promise<StaffResult<DeliveryTariffs>> =>
      call("PUT", "/admin/shipping/tariffs", token, DeliveryTariffsSchema, tariffs),
    /** Photo du dossier, déchiffrée par l'API (consultation au journal) : WebP vérifié, 5 Mo au plus. */
    kycDocument(token: string, shopId: string, kind: KycDocumentKind): Promise<StaffImageResult> {
      const shop = id(shopId);
      if (!shop) return Promise.resolve({ status: 404 });
      return fetchImage(
        token,
        `/admin/kyc/${shop}/documents/${kind}`,
        5_242_880,
        "pièce du dossier",
      );
    },
  };
}

export type StaffApi = ReturnType<typeof createStaffApi>;
