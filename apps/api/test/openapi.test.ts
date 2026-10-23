import { readFileSync } from "node:fs";
import { Validator } from "@seriousme/openapi-schema-validator";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../src/docs/openapi.js";

const committed = new URL("../../../docs/api/openapi.json", import.meta.url);

describe("Description OpenAPI", () => {
  const document = buildOpenApiDocument();

  it("est un document OpenAPI 3.1 valide", async () => {
    const result = await new Validator().validate(document);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("chaque référence pointe vers un schéma existant", () => {
    const schemas = Object.keys((document.components as { schemas: object }).schemas);
    const refs = [
      ...JSON.stringify(document).matchAll(/"#\/components\/schemas\/([A-Za-z]+)"/g),
    ].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(10);
    for (const ref of refs) expect(schemas, ref).toContain(ref);
  });

  it("documente toutes les routes", () => {
    expect(Object.keys(document.paths as object).sort()).toEqual([
      "/api/health",
      "/api/v1/account/data",
      "/api/v1/account/delete",
      "/api/v1/account/deletion",
      "/api/v1/admin/accounts/lookup",
      "/api/v1/admin/accounts/{accountId}/disable",
      "/api/v1/admin/accounts/{accountId}/enable",
      "/api/v1/admin/accounts/{accountId}/remove-staff",
      "/api/v1/admin/accounts/{accountId}/roles/{role}",
      "/api/v1/admin/audit",
      "/api/v1/admin/cash-to-collect",
      "/api/v1/admin/coupons",
      "/api/v1/admin/coupons/{couponId}",
      "/api/v1/admin/invoices",
      "/api/v1/admin/invoices/{number}",
      "/api/v1/admin/invoices/{number}/resend",
      "/api/v1/admin/kyc",
      "/api/v1/admin/kyc/{shopId}",
      "/api/v1/admin/kyc/{shopId}/approve",
      "/api/v1/admin/kyc/{shopId}/documents/{kind}",
      "/api/v1/admin/kyc/{shopId}/reject",
      "/api/v1/admin/orders/{reference}/cancel",
      "/api/v1/admin/orders/{reference}/cod-collected",
      "/api/v1/admin/refunds",
      "/api/v1/admin/refunds/{refundId}/done",
      "/api/v1/admin/settings/billing",
      "/api/v1/admin/settings/cod",
      "/api/v1/admin/shipping/ready",
      "/api/v1/admin/shipping/shipments",
      "/api/v1/admin/shipping/shipments/{reference}",
      "/api/v1/admin/shipping/shipments/{reference}/cancel",
      "/api/v1/admin/shipping/shipments/{reference}/delivered",
      "/api/v1/admin/shipping/shipments/{reference}/failed",
      "/api/v1/admin/shipping/shipments/{reference}/hand-over",
      "/api/v1/admin/shipping/shipments/{reference}/retry",
      "/api/v1/admin/shipping/tariffs",
      "/api/v1/admin/shops",
      "/api/v1/admin/shops/{shopId}",
      "/api/v1/admin/shops/{shopId}/approve",
      "/api/v1/admin/shops/{shopId}/reject",
      "/api/v1/admin/shops/{shopId}/suspend",
      "/api/v1/admin/staff",
      "/api/v1/auth/2fa",
      "/api/v1/auth/2fa/enable",
      "/api/v1/auth/2fa/recovery-codes",
      "/api/v1/auth/2fa/setup",
      "/api/v1/auth/2fa/verify",
      "/api/v1/auth/devices/not-me",
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
      "/api/v1/auth/logout-all",
      "/api/v1/auth/password/change",
      "/api/v1/auth/password/forgot",
      "/api/v1/auth/password/resend",
      "/api/v1/auth/password/reset",
      "/api/v1/auth/session",
      "/api/v1/auth/signup",
      "/api/v1/auth/signup/resend",
      "/api/v1/auth/signup/verify",
      "/api/v1/availability",
      "/api/v1/cart",
      "/api/v1/cart/items",
      "/api/v1/cart/items/{variantId}",
      "/api/v1/cart/merge",
      "/api/v1/categories",
      "/api/v1/categories/{slug}",
      "/api/v1/moderation/listing-corrections",
      "/api/v1/moderation/listing-corrections/{correctionId}/close",
      "/api/v1/moderation/listings",
      "/api/v1/moderation/listings/{listingId}",
      "/api/v1/moderation/listings/{listingId}/images/{imageId}",
      "/api/v1/moderation/listings/{listingId}/merge",
      "/api/v1/moderation/offers/{productId}/withdraw",
      "/api/v1/moderation/products",
      "/api/v1/moderation/products/{productId}",
      "/api/v1/moderation/products/{productId}/approve",
      "/api/v1/moderation/products/{productId}/images/{imageId}",
      "/api/v1/moderation/products/{productId}/reject",
      "/api/v1/orders",
      "/api/v1/orders/quote",
      "/api/v1/orders/{reference}",
      "/api/v1/orders/{reference}/cancel",
      "/api/v1/orders/{reference}/invoices",
      "/api/v1/orders/{reference}/invoices/{number}",
      "/api/v1/orders/{reference}/payments",
      "/api/v1/orders/{reference}/shipment",
      "/api/v1/product-images/{imageId}/{size}",
      "/api/v1/products",
      "/api/v1/products/facets",
      "/api/v1/products/suggestions",
      "/api/v1/products/{slug}",
      "/api/v1/sandbox/mobile-money/requests",
      "/api/v1/sandbox/mobile-money/requests/{paymentId}",
      "/api/v1/shipping/tariffs",
      "/api/v1/support/accounts/lookup",
      "/api/v1/support/accounts/{accountId}/orders",
      "/api/v1/support/accounts/{accountId}/orders/{reference}",
      "/api/v1/vendors/kyc",
      "/api/v1/vendors/kyc/documents/{kind}",
      "/api/v1/vendors/kyc/submit",
      "/api/v1/vendors/listings",
      "/api/v1/vendors/listings/{listingId}",
      "/api/v1/vendors/listings/{listingId}/offer",
      "/api/v1/vendors/orders",
      "/api/v1/vendors/orders/{reference}",
      "/api/v1/vendors/orders/{reference}/accept",
      "/api/v1/vendors/orders/{reference}/refuse",
      "/api/v1/vendors/products",
      "/api/v1/vendors/products/{productId}",
      "/api/v1/vendors/products/{productId}/archive",
      "/api/v1/vendors/products/{productId}/corrections",
      "/api/v1/vendors/products/{productId}/images",
      "/api/v1/vendors/products/{productId}/images/{imageId}",
      "/api/v1/vendors/products/{productId}/restore",
      "/api/v1/vendors/products/{productId}/variants",
      "/api/v1/vendors/products/{productId}/variants/{variantId}",
      "/api/v1/vendors/shop",
      "/api/v1/webhooks/mobile-money",
    ]);
  });

  it("le fichier docs/api/openapi.json est à jour (sinon : pnpm --filter @kemdia/api openapi)", () => {
    expect(JSON.parse(readFileSync(committed, "utf8"))).toEqual(document);
  });
});
