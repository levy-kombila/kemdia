import "server-only";
import {
  AdminInvoicePageSchema,
  AdminInvoiceSchema,
  AuditPageSchema,
  BillingSettingsSchema,
  CashToCollectListSchema,
  CodSettingsSchema,
  COUPON_ERROR_CODES,
  CouponPageSchema,
  CouponSchema,
  ADMIN_INVOICE_CURSOR_PATTERN,
  AUDIT_CURSOR_PATTERN,
  COUPON_CURSOR_PATTERN,
  INVOICE_NUMBER_PATTERN,
  PAYMENT_ERROR_CODES,
  PaymentSchema,
  RefundPageSchema,
  RefundSchema,
  type AdminInvoice,
  type AdminInvoicePage,
  type AuditAction,
  type AuditPage,
  type BillingSettings,
  type BillingSettingsRequest,
  type CashToCollectList,
  type CodSettings,
  type CodSettingsRequest,
  type Coupon,
  type CouponCreateRequest,
  type CouponErrorCode,
  type CouponPage,
  type Payment,
  type PaymentErrorCode,
  type Refund,
  type RefundPage,
  AdminAccountSchema,
  ORDER_CURSOR_PATTERN,
  OrderPageSchema,
  OrderSchema,
  STAFF_CURSOR_PATTERN,
  StaffActionResultSchema,
  StaffPageSchema,
  SupportAccountSchema,
  type AdminAccount,
  type AssignableRole,
  type Order,
  type OrderPage,
  type StaffActionResult,
  type StaffPage,
  type StaffRole,
  type SupportAccount,
  AdminListingDetailSchema,
  AdminListingPageSchema,
  AdminListingSchema,
  ListingCorrectionPageSchema,
  ListingCorrectionSchema,
  ListingMergeResultSchema,
  type AdminListing,
  type AdminListingDetail,
  type AdminListingPage,
  type ListingCorrection,
  type ListingCorrectionPage,
  type ListingMergeResult,
  type ListingUpdateRequest,
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
import { log } from "@/lib/log";

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
export type StaffOrderCode = "COMMANDE_INTROUVABLE" | "PANIER_OCCUPE" | "ANNULATION_IMPOSSIBLE";
export type StaffFailureCode =
  | IdentityErrorCode
  | VendorErrorCode
  | ShippingErrorCode
  | StaffOrderCode
  // Finance (S7.5-T05)
  | PaymentErrorCode
  | CouponErrorCode
  | "INDISPONIBLE";
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
  "ANNULATION_IMPOSSIBLE",
  ...PAYMENT_ERROR_CODES,
  ...COUPON_ERROR_CODES,
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

export type StaffPdfResult =
  { status: 200; bytes: Uint8Array<ArrayBuffer> } | { status: 403 | 404 | 503 };

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
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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
      log.error(
        "équipe",
        `${method} ${routeOf(path)} : ${timeout ? "délai dépassé" : "API injoignable"}`,
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
      log.error("équipe", `${method} ${routeOf(path)} : statut ${response.status}`);
      return { ok: false, code: "INDISPONIBLE" };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      // Chemins des champs seulement : jamais les valeurs reçues dans le journal
      const fields = parsed.error.issues.map((i) => i.path.join(".") || "(racine)").slice(0, 5);
      log.error(
        "équipe",
        `${method} ${routeOf(path)} : réponse non conforme au contrat (${fields.join(", ")})`,
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
      log.error("équipe", `${what} : API injoignable`);
      return { status: 503 };
    }
    if (response.status === 404 || response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      return { status: response.status === 404 ? 404 : 403 };
    }
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (response.status !== 200 || type !== "image/webp") {
      await response.body?.cancel().catch(() => undefined);
      log.error("équipe", `${what} : statut ${response.status}`);
      return { status: 503 };
    }
    const bytes = await readAtMost(response, maxBytes).catch(() => null);
    if (!bytes || !isWebp(bytes)) {
      log.error("équipe", `${what} : fichier non conforme`);
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

    // --- Fiches communes (S7.5-T02, S7.5-T03 ; modérateurs et administrateurs) ---
    listings: (
      token: string,
      params: { q?: string; status?: string; after?: string },
    ): Promise<StaffResult<AdminListingPage>> => {
      const query = new URLSearchParams();
      if (params.q) query.set("q", params.q.slice(0, 100));
      if (params.status) query.set("status", params.status);
      if (params.after) query.set("after", params.after);
      const text = query.toString();
      return call(
        "GET",
        `/moderation/listings${text ? `?${text}` : ""}`,
        token,
        AdminListingPageSchema,
      );
    },
    listing: (token: string, listingId: string): Promise<StaffResult<AdminListingDetail>> => {
      const listing = id(listingId);
      return listing
        ? call("GET", `/moderation/listings/${listing}`, token, AdminListingDetailSchema)
        : Promise.resolve(notFound("FICHE_INTROUVABLE"));
    },
    updateListing: (
      token: string,
      listingId: string,
      request: ListingUpdateRequest,
    ): Promise<StaffResult<AdminListing>> => {
      const listing = id(listingId);
      return listing
        ? call("PATCH", `/moderation/listings/${listing}`, token, AdminListingSchema, request)
        : Promise.resolve(notFound("FICHE_INTROUVABLE"));
    },
    removeListingImage: (
      token: string,
      listingId: string,
      imageId: string,
    ): Promise<StaffResult<AdminListing>> => {
      const listing = id(listingId);
      const image = id(imageId);
      return listing && image
        ? call(
            "DELETE",
            `/moderation/listings/${listing}/images/${image}`,
            token,
            AdminListingSchema,
          )
        : Promise.resolve(notFound("PHOTO_INTROUVABLE"));
    },
    mergeListing: (
      token: string,
      listingId: string,
      into: string,
      variants: Record<string, string>,
    ): Promise<StaffResult<ListingMergeResult>> => {
      const listing = id(listingId);
      const target = id(into);
      return listing && target
        ? call("POST", `/moderation/listings/${listing}/merge`, token, ListingMergeResultSchema, {
            into: target,
            variants,
          })
        : Promise.resolve(notFound("FICHE_INTROUVABLE"));
    },
    withdrawOffer: (
      token: string,
      productId: string,
      reason: string,
    ): Promise<StaffResult<ModerationProduct>> => {
      const product = id(productId);
      return product
        ? call("POST", `/moderation/offers/${product}/withdraw`, token, ModerationProductSchema, {
            reason,
          })
        : Promise.resolve(notFound("PRODUIT_INTROUVABLE"));
    },
    corrections: (
      token: string,
      params: { status?: "open" | "closed"; listingId?: string; after?: string },
    ): Promise<StaffResult<ListingCorrectionPage>> => {
      const query = new URLSearchParams();
      if (params.status) query.set("status", params.status);
      if (params.listingId && id(params.listingId))
        query.set("listingId", params.listingId.toLowerCase());
      if (params.after) query.set("after", params.after);
      const text = query.toString();
      return call(
        "GET",
        `/moderation/listing-corrections${text ? `?${text}` : ""}`,
        token,
        ListingCorrectionPageSchema,
      );
    },
    closeCorrection: (
      token: string,
      correctionId: string,
      note?: string,
    ): Promise<StaffResult<ListingCorrection>> => {
      const correction = id(correctionId);
      return correction
        ? call(
            "POST",
            `/moderation/listing-corrections/${correction}/close`,
            token,
            ListingCorrectionSchema,
            note ? { note } : {},
          )
        : Promise.resolve(notFound("CORRECTION_INTROUVABLE"));
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
    // --- Équipe (S7.5-T04, ADR-0051 ; administrateurs) ---
    staff: (
      token: string,
      params: { role?: StaffRole; after?: string; limit?: number },
    ): Promise<StaffResult<StaffPage>> => {
      const query = new URLSearchParams();
      if (params.role) query.set("role", params.role);
      if (params.after && STAFF_CURSOR_PATTERN.test(params.after)) query.set("after", params.after);
      if (params.limit) query.set("limit", String(params.limit));
      const text = query.toString();
      return call("GET", `/admin/staff${text ? `?${text}` : ""}`, token, StaffPageSchema);
    },
    /** E-mail ou téléphone dans le CORPS : jamais dans l'adresse ni dans les journaux. */
    lookupAccount: (token: string, identifier: string): Promise<StaffResult<AdminAccount>> =>
      call("POST", "/admin/accounts/lookup", token, AdminAccountSchema, {
        identifier: identifier.slice(0, 300),
      }),
    setRole: (
      token: string,
      accountId: string,
      role: AssignableRole,
      granted: boolean,
    ): Promise<StaffResult<AdminAccount>> => {
      const account = id(accountId);
      if (!account) return Promise.resolve(notFound("COMPTE_INTROUVABLE"));
      return call(
        granted ? "PUT" : "DELETE",
        `/admin/accounts/${account}/roles/${role}`,
        token,
        AdminAccountSchema,
      );
    },
    /** Départ d'un employé (retirer ses rôles), désactivation (motif obligatoire) ou réactivation. */
    staffAction: (
      token: string,
      accountId: string,
      action: "remove-staff" | "disable" | "enable",
      reason?: string,
    ): Promise<StaffResult<StaffActionResult>> => {
      const account = id(accountId);
      if (!account) return Promise.resolve(notFound("COMPTE_INTROUVABLE"));
      return call(
        "POST",
        `/admin/accounts/${account}/${action}`,
        token,
        StaffActionResultSchema,
        action === "disable" ? { reason: reason ?? "" } : {},
      );
    },

    // --- Service client (S7.5-T04 ; lecture seule) ---
    /** Recherche inscrite au journal d'audit par l'API ; e-mail ou téléphone dans le corps seulement. */
    supportLookup: (token: string, identifier: string): Promise<StaffResult<SupportAccount>> =>
      call("POST", "/support/accounts/lookup", token, SupportAccountSchema, {
        identifier: identifier.slice(0, 300),
      }),
    supportOrders: (
      token: string,
      accountId: string,
      before?: string,
    ): Promise<StaffResult<OrderPage>> => {
      const account = id(accountId);
      if (!account) return Promise.resolve(notFound("COMPTE_INTROUVABLE"));
      const query = before && ORDER_CURSOR_PATTERN.test(before) ? `?before=${before}` : "";
      return call("GET", `/support/accounts/${account}/orders${query}`, token, OrderPageSchema);
    },
    supportOrder: (
      token: string,
      accountId: string,
      reference: string,
    ): Promise<StaffResult<Order>> => {
      const account = id(accountId);
      if (!account || !ORDER_REFERENCE.test(reference))
        return Promise.resolve(notFound("COMMANDE_INTROUVABLE"));
      return call("GET", `/support/accounts/${account}/orders/${reference}`, token, OrderSchema);
    },

    // --- Finance (S7.5-T05, ADR-0052 ; rôle finance) ---
    invoices: (
      token: string,
      params: { q?: string; after?: string },
    ): Promise<StaffResult<AdminInvoicePage>> => {
      const query = new URLSearchParams();
      if (params.q) query.set("q", params.q.slice(0, 30));
      if (params.after && ADMIN_INVOICE_CURSOR_PATTERN.test(params.after))
        query.set("after", params.after);
      const text = query.toString();
      return call("GET", `/admin/invoices${text ? `?${text}` : ""}`, token, AdminInvoicePageSchema);
    },
    resendInvoice: (token: string, number: string): Promise<StaffResult<AdminInvoice>> =>
      INVOICE_NUMBER_PATTERN.test(number)
        ? call("POST", `/admin/invoices/${number}/resend`, token, AdminInvoiceSchema, {})
        : Promise.resolve(notFound("FACTURE_INTROUVABLE")),
    /** PDF d'une facture : vérifié (signature %PDF, 5 Mo au plus) avant d'être relayé. */
    async invoicePdf(token: string, number: string): Promise<StaffPdfResult> {
      if (!INVOICE_NUMBER_PATTERN.test(number) || !SESSION_TOKEN_PATTERN.test(token))
        return { status: 404 };
      let response: Response;
      try {
        response = await doFetch(`${options.url}/api/v1/admin/invoices/${number}`, {
          headers: await headersFor(token, "application/pdf"),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(options.timeoutMs),
        });
      } catch {
        log.error("équipe", "GET /admin/invoices/{numéro} : API injoignable");
        return { status: 503 };
      }
      if (response.status === 404) return { status: 404 };
      if (response.status === 401 || response.status === 403) return { status: 403 };
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.startsWith("application/pdf")) return { status: 503 };
      const bytes = await readAtMost(response, 5_242_880);
      if (!bytes || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-")
        return { status: 503 };
      return { status: 200, bytes };
    },
    cashToCollect: (token: string): Promise<StaffResult<CashToCollectList>> =>
      call("GET", "/admin/cash-to-collect", token, CashToCollectListSchema),
    codCollected: (
      token: string,
      reference: string,
      amount: number,
    ): Promise<StaffResult<Payment>> =>
      ORDER_REFERENCE.test(reference)
        ? call("POST", `/admin/orders/${reference}/cod-collected`, token, PaymentSchema, { amount })
        : Promise.resolve(notFound("COMMANDE_INTROUVABLE")),
    refunds: (token: string, status: "to_do" | "done"): Promise<StaffResult<RefundPage>> =>
      call("GET", `/admin/refunds?status=${status}`, token, RefundPageSchema),
    refundDone: (
      token: string,
      refundId: string,
      externalReference: string,
    ): Promise<StaffResult<Refund>> => {
      const refund = id(refundId);
      return refund
        ? call("POST", `/admin/refunds/${refund}/done`, token, RefundSchema, { externalReference })
        : Promise.resolve(notFound("REMBOURSEMENT_INTROUVABLE"));
    },
    coupons: (token: string, before?: string): Promise<StaffResult<CouponPage>> =>
      call(
        "GET",
        `/admin/coupons${before && COUPON_CURSOR_PATTERN.test(before) ? `?before=${before}` : ""}`,
        token,
        CouponPageSchema,
      ),
    createCoupon: (token: string, coupon: CouponCreateRequest): Promise<StaffResult<Coupon>> =>
      call("POST", "/admin/coupons", token, CouponSchema, coupon),
    setCouponActive: (
      token: string,
      couponId: string,
      active: boolean,
    ): Promise<StaffResult<Coupon>> => {
      const coupon = id(couponId);
      return coupon
        ? call("PATCH", `/admin/coupons/${coupon}`, token, CouponSchema, { active })
        : Promise.resolve(notFound("COUPON_INTROUVABLE"));
    },
    billingSettings: (token: string): Promise<StaffResult<BillingSettings>> =>
      call("GET", "/admin/settings/billing", token, BillingSettingsSchema),
    saveBillingSettings: (
      token: string,
      settings: BillingSettingsRequest,
    ): Promise<StaffResult<BillingSettings>> =>
      call("PUT", "/admin/settings/billing", token, BillingSettingsSchema, settings),
    codSettings: (token: string): Promise<StaffResult<CodSettings>> =>
      call("GET", "/admin/settings/cod", token, CodSettingsSchema),
    saveCodSettings: (
      token: string,
      settings: CodSettingsRequest,
    ): Promise<StaffResult<CodSettings>> =>
      call("PUT", "/admin/settings/cod", token, CodSettingsSchema, settings),

    // --- Journal d'audit (S7.5-T05 ; administrateurs) ---
    audit: (
      token: string,
      params: { action?: AuditAction; accountId?: string; before?: string },
    ): Promise<StaffResult<AuditPage>> => {
      const query = new URLSearchParams({ limit: "50" });
      if (params.action) query.set("action", params.action);
      const account = params.accountId ? id(params.accountId) : null;
      if (account) query.set("accountId", account);
      if (params.before && AUDIT_CURSOR_PATTERN.test(params.before))
        query.set("before", params.before);
      return call("GET", `/admin/audit?${query.toString()}`, token, AuditPageSchema);
    },

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
