import { describe, expect, it, vi } from "vitest";
import { fetchVendorImage } from "./api-vendor-image";

const KEY = "k".repeat(40);
const ID = "0f0e0d0c-0b0a-4908-8706-050403020100";
const ETAG = `"${"a".repeat(32)}-large"`;

const webp = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "));
  return bytes;
};
const image = (bytes: Uint8Array<ArrayBuffer>, type = "image/webp", status = 200) =>
  new Response(bytes, { status, headers: { "content-type": type, etag: ETAG } });

function call(response: Response | Error, ifNoneMatch: string | null = null) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  );
  const result = fetchVendorImage(
    { url: "http://api.test", key: KEY, timeoutMs: 1000, fetch },
    ID,
    "small",
    ifNoneMatch,
  );
  return { fetch, result };
}

describe("Relais des photos des vendeurs (S6-T04)", () => {
  it("demande la photo avec la clé interne et relaie un WebP vérifié", async () => {
    const { fetch, result } = call(image(webp()));
    expect(await result).toMatchObject({ status: 200, etag: ETAG });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`http://api.test/api/v1/product-images/${ID}/small`);
    expect(new Headers(init?.headers).get("x-kemdia-internal-key")).toBe(KEY);
    expect(init?.redirect).toBe("error");
  });

  it("transmet l'adresse du visiteur : la limite de l'API s'applique à lui, pas au site entier", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(image(webp())));
    await fetchVendorImage(
      { url: "http://api.test", key: KEY, timeoutMs: 1000, fetch, visitorIp: "41.158.1.2" },
      ID,
      "large",
      null,
    );
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get("x-kemdia-client-ip")).toBe(
      "41.158.1.2",
    );
  });

  it("transmet une empreinte bien formée (304), jamais une autre", async () => {
    const first = call(new Response(null, { status: 304, headers: { etag: ETAG } }), ETAG);
    expect(await first.result).toEqual({ status: 304, etag: ETAG });
    expect(new Headers(first.fetch.mock.calls[0]![1]?.headers).get("if-none-match")).toBe(ETAG);
    const bad = call(image(webp()), '"x"\r\nSet-Cookie: a=b');
    await bad.result;
    expect(new Headers(bad.fetch.mock.calls[0]![1]?.headers).get("if-none-match")).toBeNull();
  });

  it("404 de l'API : photo introuvable", async () => {
    expect(await call(new Response("{}", { status: 404 })).result).toEqual({ status: 404 });
  });

  it("ne relaie jamais autre chose qu'un WebP de 2 Mo au plus", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    for (const response of [
      image(webp(), "text/html"),
      image(html),
      image(webp(2 * 1024 * 1024 + 1)),
      image(webp(), "image/webp", 500),
      new Error("ECONNREFUSED"),
    ]) {
      expect(await call(response).result).toEqual({ status: 503 });
    }
  });
});
