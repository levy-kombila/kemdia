import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cart, OrderQuote } from "@kemdia/contracts";
import { Providers } from "@/components/providers/Providers";
import { CheckoutFlow } from "./CheckoutFlow";

/**
 * Tunnel branché sur l'API (S5-T07) : actions serveur remplacées. Le compte est connecté (panier du serveur) ; les
 * montants affichés viennent du devis ; la commande part avec le total du devis et ouvre la page de la commande.
 */
const cart = vi.hoisted(() => ({
  syncCart: vi.fn(),
  addToServerCart: vi.fn(),
  setServerCartQuantity: vi.fn(),
  removeFromServerCart: vi.fn(),
  clearServerCart: vi.fn(),
}));
vi.mock("@/lib/orders/cart-actions", () => cart);

const orders = vi.hoisted(() => ({
  quoteOrder: vi.fn(),
  placeOrder: vi.fn(),
  retryPayment: vi.fn(),
  cancelOrder: vi.fn(),
}));
vi.mock("@/lib/orders/order-actions", () => orders);

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const VARIANT = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";

function serverCart(price: number): Cart {
  return {
    lines: [
      {
        variantId: VARIANT,
        productId: "0b9f1c7e-3f5a-4b8e-9c2d-1a2b3c4d5e6f",
        variantName: "",
        slug: "pixel",
        title: "Google Pixel Blanc",
        price,
        compareAtPrice: null,
        image: null,
        quantity: 1,
        maxQuantity: 10,
        ok: true,
      },
    ],
    itemCount: 1,
    subtotal: price,
    ok: true,
  };
}

function quote(subtotal: number, overrides: Partial<OrderQuote> = {}): OrderQuote {
  return {
    subtotal,
    discount: 0,
    coupon: null,
    deliveryFee: 2_000,
    total: subtotal + 2_000,
    freeDeliveryThreshold: 50_000,
    deliveryDaysMin: 1,
    deliveryDaysMax: 2,
    cartOk: true,
    cod: { allowed: true },
    mobileMoney: { allowed: true },
    ...overrides,
  };
}

const ACCOUNT = { fullName: "Marie Nze", phone: "+241077123456" };

function renderFlow() {
  return render(
    <Providers signedIn>
      <CheckoutFlow account={ACCOUNT} />
    </Providers>,
  );
}

async function fillAddress(user: ReturnType<typeof userEvent.setup>) {
  // Nom et téléphone viennent du compte
  expect(await screen.findByLabelText("Prénom et nom")).toHaveValue("Marie Nze");
  expect(screen.getByLabelText("Téléphone")).toHaveValue("077 12 34 56");
  await user.selectOptions(screen.getByRole("combobox", { name: "Ville" }), "libreville");
  await user.selectOptions(screen.getByRole("combobox", { name: "Quartier" }), "Glass");
  await user.type(screen.getByLabelText("Point de repère"), "Face à la pharmacie");
  await user.click(screen.getByRole("button", { name: "Continuer" }));
}

// Parcours saisis touche par touche : plus lents que 5 s quand tous les tests du dépôt tournent en parallèle.
describe("<CheckoutFlow />", { timeout: 15_000 }, () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    cart.syncCart.mockResolvedValue({ status: "signed-in", cart: serverCart(20_000), ignored: 0 });
    orders.quoteOrder.mockImplementation(async (_city: string, coupon?: string) =>
      coupon === "BIENVENUE"
        ? {
            ok: true,
            quote: quote(20_000, {
              discount: 2_000,
              coupon: { code: "BIENVENUE", discount: 2_000 },
              total: 20_000,
            }),
          }
        : coupon
          ? { ok: false, code: "COUPON_EXPIRE", message: "Ce code promo a expiré." }
          : { ok: true, quote: quote(20_000) },
    );
  });

  it("bloque l'étape adresse tant qu'elle est incomplète", async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole("button", { name: "Continuer" }));
    expect(screen.getByLabelText("Point de repère")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Point de repère")).toHaveAccessibleDescription(
      /repère pour le livreur/,
    );
    expect(orders.quoteOrder).not.toHaveBeenCalled();
  });

  it("Airtel Money : total du serveur, commande avec ce total, puis page de la commande", async () => {
    orders.placeOrder.mockResolvedValue({ ok: true, reference: "KMD-7F3K9Q" });
    const user = userEvent.setup();
    renderFlow();
    await fillAddress(user);
    expect(screen.getByText(/Livraison à domicile, Libreville/)).toBeInTheDocument();
    expect(orders.quoteOrder).toHaveBeenCalledWith("libreville", undefined);
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    // numéro de paiement proposé depuis l'adresse, opérateur Airtel déduit du 07
    expect(screen.getByLabelText("Numéro Airtel Money")).toHaveValue("077 12 34 56");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(await screen.findByRole("button", { name: /Commander et payer · 22\s000/ }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/compte/commandes/KMD-7F3K9Q?nouvelle=1"),
    );
    const sent = orders.placeOrder.mock.calls[0]![0];
    expect(sent).toMatchObject({
      expectedTotal: 22_000,
      delivery: { fullName: "Marie Nze", phone: "+241077123456", cityId: "libreville" },
      payment: { method: "airtel", phone: "+241077123456" },
    });
    expect(sent.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    // Ni article ni prix envoyés par le navigateur (BR-004)
    expect(JSON.stringify(sent)).not.toMatch(/variant|price|items/i);
    // Le panier du compte est relu (l'API en a retiré les articles commandés)
    expect(cart.syncCart).toHaveBeenCalledTimes(2);
  });

  it("code promo : refusé sous le champ, accepté dans le total ; la commande l'emporte", async () => {
    orders.placeOrder.mockResolvedValue({ ok: true, reference: "KMD-7F3K9Q" });
    const user = userEvent.setup();
    renderFlow();
    await fillAddress(user);
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    await user.type(await screen.findByLabelText("Code promo"), "vieux-code");
    await user.click(screen.getByRole("button", { name: "Appliquer" }));
    expect(await screen.findByText("Ce code promo a expiré.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Code promo"));
    await user.type(screen.getByLabelText("Code promo"), "bienvenue");
    await user.click(screen.getByRole("button", { name: "Appliquer" }));
    expect(await screen.findByText(/appliqué/)).toHaveTextContent(/Code BIENVENUE appliqué/);
    await user.click(screen.getByRole("button", { name: /Commander et payer · 20\s000/ }));
    await waitFor(() => expect(orders.placeOrder).toHaveBeenCalled());
    expect(orders.placeOrder.mock.calls[0]![0]).toMatchObject({
      couponCode: "BIENVENUE",
      expectedTotal: 20_000,
    });
  });

  it("total modifié entre-temps : nouveau devis affiché, même clé renvoyée au deuxième clic", async () => {
    orders.placeOrder
      .mockResolvedValueOnce({ ok: false, code: "PRIX_MODIFIE", message: "Le total a changé." })
      .mockResolvedValueOnce({ ok: true, reference: "KMD-7F3K9Q" });
    const user = userEvent.setup();
    renderFlow();
    await fillAddress(user);
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    orders.quoteOrder.mockResolvedValue({ ok: true, quote: quote(25_000) });
    await user.click(await screen.findByRole("button", { name: /Commander et payer · 22\s000/ }));
    expect(await screen.findByText("Le total a changé.")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Commander et payer · 27\s000/ }));
    await waitFor(() => expect(orders.placeOrder).toHaveBeenCalledTimes(2));
    const [first, second] = orders.placeOrder.mock.calls.map((c) => c[0]);
    expect(second.expectedTotal).toBe(27_000);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("clé déjà utilisée (envoi précédent perdu) : panier relu, renvoi vers « Mes commandes », nouvelle clé", async () => {
    orders.placeOrder
      .mockResolvedValueOnce({
        ok: false,
        code: "CLE_DEJA_UTILISEE",
        message: "Une commande a peut-être déjà été enregistrée.",
      })
      .mockResolvedValueOnce({ ok: true, reference: "KMD-7F3K9Q" });
    const user = userEvent.setup();
    renderFlow();
    await fillAddress(user);
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(await screen.findByRole("button", { name: /Commander et payer/ }));
    expect(
      await screen.findByText(/Une commande a peut-être déjà été enregistrée/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir mes commandes" })).toHaveAttribute(
      "href",
      "/compte/commandes",
    );
    expect(cart.syncCart).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: /Commander et payer/ }));
    await waitFor(() => expect(orders.placeOrder).toHaveBeenCalledTimes(2));
    const [first, second] = orders.placeOrder.mock.calls.map((c) => c[0]);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("Mobile Money indisponible : paiement à la livraison proposé d'office ; au-delà du plafond, refusé", async () => {
    orders.quoteOrder.mockResolvedValue({
      ok: true,
      quote: quote(20_000, { mobileMoney: { allowed: false } }),
    });
    const user = userEvent.setup();
    renderFlow();
    await fillAddress(user);
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByRole("radio", { name: /Airtel Money/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Paiement à la livraison/ })).toBeChecked();
    expect(screen.queryByLabelText(/Numéro Airtel/)).not.toBeInTheDocument();
  });

  it("refuse un numéro d'un autre opérateur et grise le paiement à la livraison refusé par le serveur", async () => {
    orders.quoteOrder.mockResolvedValue({
      ok: true,
      quote: quote(214_000, { cod: { allowed: false, reason: "Au-delà de 100 000 FCFA." } }),
    });
    const user = userEvent.setup();
    renderFlow();
    await fillAddress(user);
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByRole("radio", { name: /Paiement à la livraison/ })).toBeDisabled();
    expect(screen.getByText("Au-delà de 100 000 FCFA.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Moov Money/ }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText(/pas un numéro Moov/)).toBeInTheDocument();
  });
});
