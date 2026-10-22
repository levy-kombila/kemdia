import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdentityApi } from "./api-identity";

const KEY = "k".repeat(40);
const TOKEN = "T".repeat(43);
const TICKET = "t".repeat(43);
const ACCOUNT = {
  id: "11111111-1111-4111-8111-111111111111",
  firstName: "Awa",
  lastName: "Ndong",
  email: "awa@exemple.ga",
  phone: null,
  roles: ["client"],
};
const OPENED = { token: TOKEN, expiresAt: "2026-11-07T10:00:00.000Z", account: ACCOUNT };

function api(response: Response | Error | DOMException) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  );
  return {
    fetch,
    identity: createIdentityApi({ url: "http://api:4000", key: KEY, timeoutMs: 1000, fetch }),
  };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const problem = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { type: "about:blank", title: "Erreur", status, code }, headers);

afterEach(() => vi.restoreAllMocks());

describe("adaptateur API de l'identité", () => {
  it("connexion : clé interne, appareil du client, corps JSON ; réponse vérifiée par le contrat", async () => {
    const { fetch, identity } = api(json(200, OPENED));
    const result = await identity.login("awa@exemple.ga", "Mangue2026", "Firefox");
    expect(result).toEqual({ ok: true, data: OPENED });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://api:4000/api/v1/auth/login");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "x-kemdia-internal-key": KEY,
      "x-kemdia-user-agent": "Firefox",
      "content-type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      identifier: "awa@exemple.ga",
      password: "Mangue2026",
    });
  });

  it("appareil (S7.5-T04) : envoyé seulement s'il a la bonne forme", async () => {
    const good = api(json(200, OPENED));
    await good.identity.login("awa@exemple.ga", "Mangue2026", null, "d".repeat(43));
    expect(JSON.parse(good.fetch.mock.calls[0]![1]?.body as string)).toMatchObject({
      device: "d".repeat(43),
    });
    const bad = api(json(200, OPENED));
    await bad.identity.login("awa@exemple.ga", "Mangue2026", null, "<script>");
    expect(JSON.parse(bad.fetch.mock.calls[0]![1]?.body as string)).not.toHaveProperty("device");
  });

  it("« ce n'est pas moi » : jeton dans le corps ; jeton mal formé jamais envoyé", async () => {
    const { fetch, identity } = api(json(200, { sessionsClosed: 2 }));
    expect(await identity.deviceNotMe("j".repeat(43))).toEqual({
      ok: true,
      data: { sessionsClosed: 2 },
    });
    expect(fetch.mock.calls[0]![0]).toBe("http://api:4000/api/v1/auth/devices/not-me");
    expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toEqual({ token: "j".repeat(43) });
    const refused = api(problem(410, "ALERTE_INVALIDE"));
    expect(await refused.identity.deviceNotMe("j".repeat(43))).toEqual({
      ok: false,
      code: "ALERTE_INVALIDE",
    });
    const none = api(json(200, {}));
    expect(await none.identity.deviceNotMe("../x")).toEqual({ ok: false, code: "ALERTE_INVALIDE" });
    expect(none.fetch).not.toHaveBeenCalled();
  });

  it("adresse du visiteur transmise quand elle est connue (S4-T07), jamais sinon", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(json(200, OPENED)));
    const options = { url: "http://api:4000", key: KEY, timeoutMs: 1000, fetch };
    await createIdentityApi({ ...options, visitorIp: () => Promise.resolve("203.0.113.5") }).login(
      "a@b.ga",
      "x",
      null,
    );
    expect(fetch.mock.calls[0]![1]?.headers).toMatchObject({ "x-kemdia-client-ip": "203.0.113.5" });
    await createIdentityApi({ ...options, visitorIp: () => Promise.resolve(null) }).login(
      "a@b.ga",
      "x",
      null,
    );
    expect(fetch.mock.calls[1]![1]?.headers).not.toHaveProperty("x-kemdia-client-ip");
    // Lecture impossible (hors requête) : l'appel part quand même, sans adresse
    await createIdentityApi({ ...options, visitorIp: () => Promise.reject(new Error("x")) }).login(
      "a@b.ga",
      "x",
      null,
    );
    expect(fetch.mock.calls[2]![1]?.headers).not.toHaveProperty("x-kemdia-client-ip");
  });

  it("erreur métier : son code et le délai Retry-After", async () => {
    const { identity } = api(problem(429, "COMPTE_BLOQUE", { "retry-after": "900" }));
    expect(await identity.login("a@b.ga", "x", null)).toEqual({
      ok: false,
      code: "COMPTE_BLOQUE",
      retryAfterSeconds: 900,
    });
  });

  it("session : jeton en en-tête Bearer ; jeton mal formé jamais envoyé", async () => {
    const { fetch, identity } = api(json(200, { expiresAt: OPENED.expiresAt, account: ACCOUNT }));
    expect((await identity.session(TOKEN)).ok).toBe(true);
    expect(fetch.mock.calls[0]![1]?.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` });
    expect(await identity.session("abc")).toEqual({ ok: false, code: "SESSION_INVALIDE" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("déconnexion avec un cookie mal formé : rien n'est envoyé à l'API", async () => {
    const { fetch, identity } = api(new Response(null, { status: 204 }));
    expect(await identity.logout("pas un jeton")).toEqual({ ok: false, code: "SESSION_INVALIDE" });
    expect(await identity.logoutAll("x")).toEqual({ ok: false, code: "SESSION_INVALIDE" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("déconnexion : 204 accepté", async () => {
    const { identity } = api(new Response(null, { status: 204 }));
    expect(await identity.logout(TOKEN)).toEqual({ ok: true, data: undefined });
  });

  it.each([
    ["réponse non conforme au contrat", json(200, { token: "court" })],
    ["erreur sans code (500)", json(500, { type: "about:blank", title: "Erreur", status: 500 })],
    ["réponse illisible", new Response("<html>", { status: 502 })],
    ["API injoignable", new TypeError("fetch failed")],
    ["délai dépassé", new DOMException("t", "TimeoutError")],
  ])("%s → INDISPONIBLE, sans rien journaliser de sensible", async (_, response) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { identity } = api(response);
    expect(await identity.resetPassword(TICKET, "123456", "Secret2026", null)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toMatch(/\[identité\] \/password\/reset/);
    for (const secret of [TICKET, "123456", "Secret2026", KEY])
      expect(logged).not.toContain(secret);
  });

  it("mot de passe oublié et inscription : ticket et destination masquée", async () => {
    const started = {
      ticket: TICKET,
      channel: "email",
      sentTo: "aw•••@exemple.ga",
      resendInSeconds: 60,
    };
    const { fetch, identity } = api(json(202, started));
    expect(await identity.forgotPassword("awa@exemple.ga")).toEqual({ ok: true, data: started });
    expect(fetch.mock.calls[0]![0]).toBe("http://api:4000/api/v1/auth/password/forgot");
  });
});
