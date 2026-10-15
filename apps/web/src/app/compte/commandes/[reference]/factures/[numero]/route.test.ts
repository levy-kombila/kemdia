import { beforeEach, describe, expect, it, vi } from "vitest";

/** Téléchargement d'une facture (S5-T07) : numéros revérifiés, session obligatoire, PDF jamais mis en cache. */
const state = vi.hoisted(() => ({ token: "T".repeat(43) as string | null }));
const api = vi.hoisted(() => ({ invoicePdf: vi.fn() }));
vi.mock("@/lib/orders/orders", () => ({
  ordersApi: () => api,
  sessionToken: () => Promise.resolve(state.token),
}));

const { GET } = await import("./route");

const REF = "KMD-7F3K9Q";
const NUMBER = "KMD-F-2026-000042";
const call = (reference: string, numero: string) =>
  GET(new Request("http://site.test/x"), { params: Promise.resolve({ reference, numero }) });

beforeEach(() => {
  vi.clearAllMocks();
  state.token = "T".repeat(43);
});

describe("GET /compte/commandes/{commande}/factures/{numéro}", () => {
  it("rend le PDF en pièce jointe, privé et jamais mis en cache", async () => {
    api.invoicePdf.mockResolvedValue({ ok: true, data: new TextEncoder().encode("%PDF-1.7") });
    const res = await call(REF, NUMBER);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="${NUMBER}.pdf"`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(api.invoicePdf).toHaveBeenCalledWith("T".repeat(43), REF, NUMBER);
  });

  it("numéros mal formés : 404 sans appel ; sans session : 401 ; facture d'un autre : 404", async () => {
    expect((await call("KMD-7F3K9Q/../x", NUMBER)).status).toBe(404);
    expect((await call(REF, 'x"; filename="evil.exe')).status).toBe(404);
    expect(api.invoicePdf).not.toHaveBeenCalled();
    state.token = null;
    expect((await call(REF, NUMBER)).status).toBe(401);
    state.token = "T".repeat(43);
    api.invoicePdf.mockResolvedValue({ ok: false, code: "COMMANDE_INTROUVABLE" });
    expect((await call(REF, NUMBER)).status).toBe(404);
    api.invoicePdf.mockResolvedValue({ ok: false, code: "INDISPONIBLE" });
    expect((await call(REF, NUMBER)).status).toBe(503);
  });
});
