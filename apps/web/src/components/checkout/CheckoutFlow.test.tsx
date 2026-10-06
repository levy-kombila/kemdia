import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/providers/Providers";
import { CheckoutFlow } from "./CheckoutFlow";

vi.mock("@/lib/orders/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/orders/client")>();
  return { ...mod, orderClient: mod.createDemoOrderClient(0) };
});

function seedCart(price: number) {
  localStorage.setItem(
    "kemdia.cart.v2",
    JSON.stringify({
      lines: [
        {
          variantId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
          productId: "0b9f1c7e-3f5a-4b8e-9c2d-1a2b3c4d5e6f",
          variantName: "",
          slug: "pixel",
          title: "Google Pixel Blanc",
          price,
          image: null,
          quantity: 1,
          maxQuantity: 10,
        },
      ],
    }),
  );
}

async function fillAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Prénom et nom"), "Marie Nze");
  await user.type(screen.getByLabelText("Téléphone"), "077 12 34 56");
  await user.selectOptions(screen.getByRole("combobox", { name: "Ville" }), "libreville");
  await user.selectOptions(screen.getByRole("combobox", { name: "Quartier" }), "Glass");
  await user.type(screen.getByLabelText("Point de repère"), "Face à la pharmacie");
  await user.click(screen.getByRole("button", { name: "Continuer" }));
}

// Parcours saisis touche par touche : plus lents que 5 s quand tous les tests du dépôt tournent en parallèle.
describe("<CheckoutFlow />", { timeout: 15_000 }, () => {
  beforeEach(() => localStorage.clear());

  it("bloque l'étape adresse tant qu'elle est incomplète", async () => {
    seedCart(20_000);
    const user = userEvent.setup();
    render(
      <Providers>
        <CheckoutFlow />
      </Providers>,
    );
    await user.click(await screen.findByRole("button", { name: "Continuer" }));
    expect(screen.getByLabelText("Prénom et nom")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Point de repère")).toHaveAccessibleDescription(
      /repère pour le livreur/,
    );
  });

  it("parcours complet Airtel Money : adresse → livraison → paiement → confirmation", async () => {
    seedCart(20_000);
    const user = userEvent.setup();
    render(
      <Providers>
        <CheckoutFlow />
      </Providers>,
    );
    await fillAddress(user);
    expect(screen.getByText(/Livraison à domicile, Libreville/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    // numéro de paiement proposé depuis l'adresse, opérateur Airtel déduit du 07
    expect(screen.getByLabelText("Numéro Airtel Money")).toHaveValue("077 12 34 56");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(screen.getByRole("button", { name: /Commander et payer/ }));
    expect(
      await screen.findByText(/Merci Marie, votre commande est confirmée/),
    ).toBeInTheDocument();
    expect(screen.getByText(/KMD-DEMO-/)).toBeInTheDocument();
    // Le panier vidé est enregistré par un effet, juste après l'affichage de la confirmation
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("kemdia.cart.v2") ?? "{}").lines).toEqual([]),
    );
  });

  it("refuse un numéro d'un autre opérateur et le paiement à la livraison au-delà du plafond", async () => {
    seedCart(214_000);
    const user = userEvent.setup();
    render(
      <Providers>
        <CheckoutFlow />
      </Providers>,
    );
    await fillAddress(user);
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByRole("radio", { name: /Paiement à la livraison/ })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Moov Money/ }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText(/pas un numéro Moov/)).toBeInTheDocument();
  });
});
