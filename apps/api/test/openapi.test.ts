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
      "/api/v1/admin/accounts/lookup",
      "/api/v1/admin/accounts/{accountId}/roles/{role}",
      "/api/v1/admin/audit",
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
      "/api/v1/auth/logout-all",
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
      "/api/v1/orders",
      "/api/v1/orders/quote",
      "/api/v1/orders/{reference}",
      "/api/v1/orders/{reference}/cancel",
      "/api/v1/products",
      "/api/v1/products/facets",
      "/api/v1/products/{slug}",
    ]);
  });

  it("le fichier docs/api/openapi.json est à jour (sinon : pnpm --filter @kemdia/api openapi)", () => {
    expect(JSON.parse(readFileSync(committed, "utf8"))).toEqual(document);
  });
});
