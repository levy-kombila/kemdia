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
    ["action serveur", { "sec-fetch-dest": "document" }, "POST"],
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
