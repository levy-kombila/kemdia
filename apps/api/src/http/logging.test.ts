import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { pathOnly, requestId } from "./logging.js";

const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("journaux", () => {
  it("retire la chaîne de requête (peut contenir un téléphone ou un e-mail)", () => {
    expect(pathOnly("/api/v1/recherche?q=077123456")).toBe("/api/v1/recherche");
    expect(pathOnly(undefined)).toBe("/");
  });

  it("reprend l'identifiant de requête du relais s'il est bien formé", () => {
    const id = "0b9f1c7e-3f5a-4b8e-9c2d-1a2b3c4d5e6f";
    expect(requestId(req({ "x-request-id": id }))).toBe(id);
  });

  it("en crée un nouveau sinon (aucune donnée arbitraire dans les journaux)", () => {
    expect(requestId(req({}))).toMatch(UUID);
    expect(requestId(req({ "x-request-id": "<script>alert(1)</script>" }))).toMatch(UUID);
  });
});
