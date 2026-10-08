import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Actions serveur : cookies posés et effacés, arguments revérifiés, aucune donnée secrète renvoyée.
 * `next/headers` et l'API sont remplacés (l'adaptateur API a ses propres tests).
 */
type Cookie = { value: string; options?: Record<string, unknown> };
const jar = new Map<string, Cookie>();
const store = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
  set: (name: string, value: string, options?: Record<string, unknown>) => {
    if (options?.maxAge === 0) jar.delete(name);
    else jar.set(name, { value, options });
  },
};
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(store),
  headers: () => Promise.resolve(new Headers({ "user-agent": "Firefox" })),
}));
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const api = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  session: vi.fn(),
  signup: vi.fn(),
  verifySignup: vi.fn(),
  resendSignup: vi.fn(),
  forgotPassword: vi.fn(),
  resendReset: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("./session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session")>()),
  identityApi: () => api,
}));

const {
  clearStaleSessionAction,
  loginAction,
  logoutAction,
  logoutAllAction,
  resetPasswordAction,
  signupAction,
  verifySignupAction,
} = await import("./actions");
const { RESET_TICKET_COOKIE, SESSION_COOKIE, SIGNUP_TICKET_COOKIE } = await import("./cookies");

const TOKEN = "S".repeat(43);
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
const STARTED = {
  ticket: TICKET,
  channel: "email",
  sentTo: "aw•••@exemple.ga",
  resendInSeconds: 60,
};

beforeEach(() => {
  jar.clear();
  redirect.mockClear();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("connexion", () => {
  it("succès : cookie de session HttpOnly, SameSite=Lax, 30 jours ; ni jeton ni identifiant interne renvoyés", async () => {
    api.login.mockResolvedValue({ ok: true, data: OPENED });
    const result = await loginAction("awa@exemple.ga", "Mangue2026");
    expect(result).toEqual({
      ok: true,
      account: {
        firstName: "Awa",
        lastName: "Ndong",
        email: "awa@exemple.ga",
        phone: null,
        roles: ["client"],
      },
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(api.login).toHaveBeenCalledWith("awa@exemple.ga", "Mangue2026", "Firefox");
    expect(jar.get(SESSION_COOKIE)).toEqual({
      value: TOKEN,
      options: { httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 30 * 86400 },
    });
  });

  it("échec : aucun cookie, code de l'API renvoyé tel quel", async () => {
    api.login.mockResolvedValue({ ok: false, code: "COMPTE_BLOQUE", retryAfterSeconds: 900 });
    expect(await loginAction("awa@exemple.ga", "faux")).toEqual({
      ok: false,
      code: "COMPTE_BLOQUE",
      retryAfterSeconds: 900,
    });
    expect(jar.size).toBe(0);
  });

  it("arguments d'un autre type ou trop longs : refusés sans appeler l'API", async () => {
    expect((await loginAction({ $ne: null }, "x")).ok).toBe(false);
    expect((await loginAction("a@b.ga", "x".repeat(201))).ok).toBe(false);
    expect(api.login).not.toHaveBeenCalled();
  });

  it("nouvelle connexion sur ce navigateur : l'ancienne session est fermée", async () => {
    jar.set(SESSION_COOKIE, { value: "A".repeat(43) });
    api.login.mockResolvedValue({ ok: true, data: OPENED });
    await loginAction("awa@exemple.ga", "Mangue2026");
    expect(api.logout).toHaveBeenCalledWith("A".repeat(43));
    expect(jar.get(SESSION_COOKIE)?.value).toBe(TOKEN);
  });
});

describe("inscription", () => {
  it("ticket gardé dans un cookie HttpOnly (24 h), jamais renvoyé au navigateur", async () => {
    api.signup.mockResolvedValue({ ok: true, data: STARTED });
    const result = await signupAction({
      firstName: "Awa",
      lastName: "Ndong",
      identifier: "awa@exemple.ga",
      password: "Mangue2026",
      acceptTerms: true,
    });
    expect(result).toEqual({
      ok: true,
      channel: "email",
      sentTo: "aw•••@exemple.ga",
      resendInSeconds: 60,
    });
    expect(jar.get(SIGNUP_TICKET_COOKIE)).toMatchObject({
      value: TICKET,
      options: { httpOnly: true, maxAge: 86400 },
    });
  });

  it("conditions non acceptées : rien n'est envoyé", async () => {
    const result = await signupAction({
      firstName: "A",
      lastName: "B",
      identifier: "a@b.ga",
      password: "x",
    });
    expect(result.ok).toBe(false);
    expect(api.signup).not.toHaveBeenCalled();
  });

  it("bon code : ticket effacé, session ouverte", async () => {
    jar.set(SIGNUP_TICKET_COOKIE, { value: TICKET });
    api.verifySignup.mockResolvedValue({ ok: true, data: { status: "active", ...OPENED } });
    expect((await verifySignupAction("123456")).ok).toBe(true);
    expect(api.verifySignup).toHaveBeenCalledWith(TICKET, "123456", "Firefox");
    expect(jar.has(SIGNUP_TICKET_COOKIE)).toBe(false);
    expect(jar.get(SESSION_COOKIE)?.value).toBe(TOKEN);
  });

  it("sans ticket (expiré) ou code mal formé : refusé sans appeler l'API", async () => {
    expect(await verifySignupAction("123456")).toEqual({ ok: false, code: "CODE_EXPIRE" });
    jar.set(SIGNUP_TICKET_COOKIE, { value: TICKET });
    expect(await verifySignupAction("12ab56")).toEqual({ ok: false, code: "CODE_INVALIDE" });
    expect(api.verifySignup).not.toHaveBeenCalled();
  });
});

describe("mot de passe oublié", () => {
  it("bon code : ticket effacé, nouvelle session", async () => {
    jar.set(RESET_TICKET_COOKIE, { value: TICKET });
    api.resetPassword.mockResolvedValue({ ok: true, data: OPENED });
    expect((await resetPasswordAction("123456", "Papaye2027")).ok).toBe(true);
    expect(api.resetPassword).toHaveBeenCalledWith(TICKET, "123456", "Papaye2027", "Firefox");
    expect(jar.has(RESET_TICKET_COOKIE)).toBe(false);
    expect(jar.get(SESSION_COOKIE)?.value).toBe(TOKEN);
  });

  it("code refusé : le ticket reste (nouvel essai possible)", async () => {
    jar.set(RESET_TICKET_COOKIE, { value: TICKET });
    api.resetPassword.mockResolvedValue({ ok: false, code: "CODE_INVALIDE" });
    expect(await resetPasswordAction("123456", "Papaye2027")).toEqual({
      ok: false,
      code: "CODE_INVALIDE",
    });
    expect(jar.get(RESET_TICKET_COOKIE)?.value).toBe(TICKET);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("déconnexion", () => {
  it("cookie effacé même si l'API ne répond pas, puis accueil", async () => {
    jar.set(SESSION_COOKIE, { value: TOKEN });
    api.logout.mockResolvedValue({ ok: false, code: "INDISPONIBLE" });
    await expect(logoutAction()).rejects.toThrow("REDIRECT /");
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("tous les appareils : cookie effacé et avis sur la page de connexion", async () => {
    jar.set(SESSION_COOKIE, { value: TOKEN });
    api.logoutAll.mockResolvedValue({ ok: true, data: { revoked: 3 } });
    await expect(logoutAllAction()).rejects.toThrow("REDIRECT /connexion?deconnecte=tous");
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("tous les appareils, API en panne : on reste connecté et on prévient", async () => {
    jar.set(SESSION_COOKIE, { value: TOKEN });
    api.logoutAll.mockResolvedValue({ ok: false, code: "INDISPONIBLE" });
    await expect(logoutAllAction()).rejects.toThrow("REDIRECT /compte?erreur=indisponible");
    expect(jar.get(SESSION_COOKIE)?.value).toBe(TOKEN);
  });

  it("cookie périmé : effacé seulement si l'API refuse la session (pas en cas de panne)", async () => {
    jar.set(SESSION_COOKIE, { value: TOKEN });
    api.session.mockResolvedValue({ ok: false, code: "INDISPONIBLE" });
    await clearStaleSessionAction();
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    api.session.mockResolvedValue({ ok: false, code: "SESSION_INVALIDE" });
    await clearStaleSessionAction();
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});
