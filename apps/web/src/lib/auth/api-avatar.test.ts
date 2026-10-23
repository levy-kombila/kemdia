import { describe, expect, it, vi } from "vitest";
import { createAvatarApi } from "./api-avatar";

vi.mock("server-only", () => ({}));

const TOKEN = "T".repeat(43);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 1, 2]);
const ETAG = `"${"a".repeat(32)}"`;
const api = (fetch: typeof globalThis.fetch) =>
  createAvatarApi({
    url: "https://api.test",
    key: "cle",
    timeoutMs: 1000,
    visitorIp: "203.0.113.7",
    fetch,
  });

describe("photo de profil relayée vers l'API (S7.5-T08)", () => {
  it("lecture : clé interne, session et adresse du visiteur ; seul un petit WebP est relayé", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(WEBP, { headers: { "content-type": "image/webp", etag: ETAG } }),
      ),
    );
    const result = await api(fetch).read(TOKEN, null);
    expect(result).toMatchObject({ ok: true, data: { notModified: false, etag: ETAG } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/auth/avatar");
    expect(init.headers).toMatchObject({
      "x-kemdia-internal-key": "cle",
      authorization: `Bearer ${TOKEN}`,
      "x-kemdia-client-ip": "203.0.113.7",
    });
    // Autre chose qu'un WebP : jamais relayé
    const html = vi.fn(() =>
      Promise.resolve(
        new Response("<script>", { headers: { "content-type": "image/webp", etag: ETAG } }),
      ),
    );
    expect(await api(html).read(TOKEN, null)).toEqual({ ok: false, code: "INDISPONIBLE" });
  });

  it("304, absence, jeton mal formé", async () => {
    const notModified = vi.fn(() => Promise.resolve(new Response(null, { status: 304 })));
    expect(await api(notModified).read(TOKEN, ETAG)).toEqual({
      ok: true,
      data: { notModified: true, etag: ETAG },
    });
    const missing = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { type: "about:blank", title: "x", status: 404, code: "PHOTO_ABSENTE" },
          { status: 404 },
        ),
      ),
    );
    expect(await api(missing).read(TOKEN, null)).toMatchObject({
      ok: false,
      code: "PHOTO_ABSENTE",
    });
    expect(await api(missing).read("court", null)).toEqual({ ok: false, code: "SESSION_INVALIDE" });
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it("envoi et retrait", async () => {
    const ok = vi.fn(() => Promise.resolve(Response.json({ avatar: "0123456789abcdef" })));
    expect(await api(ok).upload(TOKEN, new Uint8Array([1]), "image/jpeg")).toEqual({
      ok: true,
      data: { avatar: "0123456789abcdef" },
    });
    const gone = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    expect(await api(gone).remove(TOKEN)).toEqual({ ok: true, data: undefined });
    const down = vi.fn(() => Promise.reject(new TypeError("réseau")));
    expect(await api(down).remove(TOKEN)).toEqual({ ok: false, code: "INDISPONIBLE" });
  });
});
