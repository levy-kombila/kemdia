import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { proxy } from "./proxy";

const TOKEN = "S".repeat(43);
const request = (headers: Record<string, string>, method = "GET") =>
  new NextRequest("http://localhost:3000/panier", {
    method,
    headers: { cookie: `${SESSION_COOKIE}=${TOKEN}`, ...headers },
  });

describe("proxy : cookie de session glissant", () => {
  it("vraie page : le cookie repart pour 30 jours, avec les mêmes protections", () => {
    const set = proxy(request({ "sec-fetch-dest": "document" })).headers.get("set-cookie") ?? "";
    expect(set).toContain(`${SESSION_COOKIE}=${TOKEN}`);
    expect(set).toMatch(/Max-Age=2592000/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
  });

  it.each([
    ["préchargement de lien", { "sec-fetch-dest": "empty", rsc: "1" }, "GET"],
    ["navigateur sans Sec-Fetch-Dest", {}, "GET"],
    [
      "action serveur",
      { "sec-fetch-dest": "document", origin: "http://localhost:3000", host: "localhost:3000" },
      "POST",
    ],
  ])("%s : rien n'est posé", (_, headers, method) => {
    expect(proxy(request(headers, method)).headers.get("set-cookie")).toBeNull();
  });

  it("sans cookie : rien n'est posé", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/", { headers: { "sec-fetch-dest": "document" } }),
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("proxy : CSRF et CSP à nonce (S4-T07)", () => {
  it("action serveur venue d'un autre site ou sans Origin : 403, avant tout traitement", async () => {
    const attempts: Record<string, string>[] = [
      { origin: "https://pirate.example", host: "localhost:3000" },
      { host: "localhost:3000" },
    ];
    for (const headers of attempts) {
      const res = proxy(request(headers, "POST"));
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("ne vient pas du site");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("chaque page reçoit une CSP avec un nonce neuf, transmis à Next.js", () => {
    const a = proxy(request({ "sec-fetch-dest": "document" }));
    const b = proxy(request({ "sec-fetch-dest": "document" }));
    const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];
    const first = nonceOf(a.headers.get("content-security-policy"));
    expect(first).toBeTruthy();
    expect(first).not.toBe(nonceOf(b.headers.get("content-security-policy")));
    // En-têtes de la requête transmise au rendu (NextResponse.next({ request: { headers } }))
    expect(a.headers.get("x-middleware-request-x-nonce")).toBe(first);
    expect(a.headers.get("content-security-policy")).not.toContain("'unsafe-inline' 'strict");
  });
});
