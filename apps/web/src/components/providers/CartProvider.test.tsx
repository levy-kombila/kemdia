import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cart } from "@kemdia/contracts";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { CartProvider, useCart } from "./CartProvider";
import { ToastProvider } from "./ToastProvider";

/**
 * Où vit le panier (S5-T01, ADR-0023) : navigateur pour un visiteur, serveur pour un compte connecté,
 * réunion une seule fois après la connexion. Les actions serveur sont remplacées.
 */
const actions = vi.hoisted(() => ({
  syncCart: vi.fn(),
  addToServerCart: vi.fn(),
  setServerCartQuantity: vi.fn(),
  removeFromServerCart: vi.fn(),
  clearServerCart: vi.fn(),
}));
vi.mock("@/lib/orders/cart-actions", () => actions);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";
const localLine = (variantId: string, quantity: number) => ({
  variantId,
  productId: PRODUCT,
  slug: "produit",
  title: `Produit ${variantId.slice(0, 1)}`,
  variantName: "",
  price: 1_000,
  image: null,
  quantity,
  maxQuantity: 10,
});
const serverCart = (
  lines: [string, number][],
  extra: Partial<Cart["lines"][number]> = {},
): Cart => ({
  lines: lines.map(([variantId, quantity]) => ({
    ...localLine(variantId, quantity),
    price: 5_000,
    compareAtPrice: null,
    maxQuantity: 20,
    ok: true,
    ...extra,
  })),
  itemCount: lines.reduce((n, [, q]) => n + q, 0),
  subtotal: 0,
  ok: lines.length > 0,
});

function Probe() {
  const cart = useCart();
  return (
    <div>
      <p data-testid="etat">
        {cart.hydrated
          ? `${cart.mode}:${cart.state.lines.map((l) => `${l.variantId.slice(0, 1)}×${l.quantity}`).join(",")}`
          : "chargement"}
      </p>
      <p data-testid="total">{cart.subtotal}</p>
      <p data-testid="caisse">{cart.canCheckout ? "oui" : "non"}</p>
      <button type="button" onClick={() => cart.add(localLine(B, 1), 1)}>
        ajouter B
      </button>
      <button type="button" onClick={() => cart.setQuantity(A, 4)}>
        A à 4
      </button>
    </div>
  );
}

function renderCart(signedIn: boolean) {
  return render(
    <ToastProvider>
      <CartProvider signedIn={signedIn}>
        <Probe />
      </CartProvider>
    </ToastProvider>,
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const stored = () =>
  JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "null") as {
    lines: { variantId: string }[];
  } | null;

beforeEach(() => {
  window.localStorage.clear();
  for (const fn of Object.values(actions)) fn.mockReset();
});

describe("<CartProvider /> (S5-T01)", () => {
  it("visiteur : panier du navigateur, aucune action serveur", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ lines: [localLine(A, 2)] }));
    renderCart(false);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("local:1×2"));
    expect(actions.syncCart).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "ajouter B" }));
    expect(stored()?.lines.map((l) => l.variantId)).toEqual([A, B]);
    expect(actions.addToServerCart).not.toHaveBeenCalled();
  });

  it("connecté : réunion du panier du navigateur, qui est vidé ; le panier du compte n'y est jamais écrit", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ lines: [localLine(A, 2)] }));
    actions.syncCart.mockResolvedValue({
      status: "signed-in",
      cart: serverCart([
        [A, 3],
        [B, 1],
      ]),
      ignored: 0,
    });
    renderCart(true);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("server:1×3,2×1"));
    const [lines, mergeId] = actions.syncCart.mock.calls[0] as [unknown, string];
    expect(lines).toEqual([{ variantId: A, quantity: 2 }]);
    expect(mergeId).toMatch(UUID);
    expect(stored()?.lines ?? []).toEqual([]);
    // Prix du serveur
    expect(screen.getByTestId("total")).toHaveTextContent(String(4 * 5_000));
  });

  it("connecté : les modifications partent vers le serveur, sa réponse fait foi", async () => {
    actions.syncCart.mockResolvedValue({
      status: "signed-in",
      cart: serverCart([[A, 1]]),
      ignored: 0,
    });
    actions.setServerCartQuantity.mockResolvedValue({ ok: true, cart: serverCart([[A, 3]]) });
    renderCart(true);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("server:1×1"));
    await userEvent.click(screen.getByRole("button", { name: "A à 4" }));
    expect(actions.setServerCartQuantity).toHaveBeenCalledWith(A, 4);
    // Le serveur a ramené la quantité au stock : c'est sa réponse qui s'affiche
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("server:1×3"));
    expect(stored()?.lines ?? []).toEqual([]);
  });

  it("refus du serveur : retour au dernier panier confirmé et message", async () => {
    actions.syncCart.mockResolvedValue({
      status: "signed-in",
      cart: serverCart([[A, 1]]),
      ignored: 0,
    });
    actions.addToServerCart.mockResolvedValue({ ok: false, code: "PANIER_PLEIN" });
    renderCart(true);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("server:1×1"));
    await userEvent.click(screen.getByRole("button", { name: "ajouter B" }));
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("server:1×1"));
    expect(await screen.findByText(/déjà 50 produits/)).toBeInTheDocument();
  });

  it("session expirée pendant une modification : retour au panier du navigateur", async () => {
    actions.syncCart.mockResolvedValue({
      status: "signed-in",
      cart: serverCart([[A, 1]]),
      ignored: 0,
    });
    actions.addToServerCart.mockResolvedValue({ ok: false, code: "SESSION_INVALIDE" });
    renderCart(true);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("server:1×1"));
    await userEvent.click(screen.getByRole("button", { name: "ajouter B" }));
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("local:"));
    expect(await screen.findByText(/session a expiré/)).toBeInTheDocument();
  });

  it("API injoignable : le panier du navigateur reste, renvoyé ensuite avec le MÊME identifiant (rien ne double)", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ lines: [localLine(A, 2)] }));
    actions.syncCart.mockResolvedValue({ status: "unavailable" });
    const first = renderCart(true);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("local:1×2"));
    expect(stored()?.lines.map((l) => l.variantId)).toEqual([A]);
    const firstId = (actions.syncCart.mock.calls[0] as [unknown, string])[1];
    expect(firstId).toMatch(UUID);
    first.unmount();

    // Chargement suivant : même réunion, même identifiant
    actions.syncCart.mockResolvedValue({
      status: "signed-in",
      cart: serverCart([[A, 2]]),
      ignored: 0,
    });
    renderCart(true);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("server:1×2"));
    expect((actions.syncCart.mock.calls[1] as [unknown, string])[1]).toBe(firstId);
    expect(stored()?.lines ?? []).toEqual([]);
  });

  it("panier du navigateur modifié après un échec : nouvel identifiant de réunion", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ lines: [localLine(A, 2)], mergeId: "44444444-4444-4444-8444-444444444444" }),
    );
    actions.syncCart.mockResolvedValue({ status: "unavailable" });
    renderCart(true);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("local:1×2"));
    expect((actions.syncCart.mock.calls[0] as [unknown, string])[1]).toBe(
      "44444444-4444-4444-8444-444444444444",
    );
    await userEvent.click(screen.getByRole("button", { name: "ajouter B" }));
    expect(stored()?.lines).toHaveLength(2);
    expect((stored() as { mergeId?: string }).mergeId).toBeUndefined();
  });

  it("ligne signalée par le serveur : hors total, passage en caisse bloqué ; lignes non reprises annoncées", async () => {
    actions.syncCart.mockResolvedValue({
      status: "signed-in",
      cart: serverCart([[A, 2]], { ok: false, reason: "PRODUIT_INDISPONIBLE", maxQuantity: 0 }),
      ignored: 2,
    });
    renderCart(true);
    await waitFor(() => expect(screen.getByTestId("caisse")).toHaveTextContent("non"));
    expect(screen.getByTestId("total")).toHaveTextContent("0");
    expect(
      await screen.findByText(/2 articles de votre panier ne sont plus disponibles/),
    ).toBeInTheDocument();
  });

  it("déconnexion : le panier du compte disparaît de l'écran, le navigateur reste vide", async () => {
    actions.syncCart.mockResolvedValue({
      status: "signed-in",
      cart: serverCart([[A, 1]]),
      ignored: 0,
    });
    const view = renderCart(true);
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("server:1×1"));
    await act(async () => {
      view.rerender(
        <ToastProvider>
          <CartProvider signedIn={false}>
            <Probe />
          </CartProvider>
        </ToastProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId("etat")).toHaveTextContent("local:"));
    expect(screen.getByTestId("etat").textContent).toBe("local:");
  });
});
