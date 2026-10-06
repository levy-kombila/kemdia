import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CartProvider, useCart } from "@/components/providers/CartProvider";
import { FavoritesProvider } from "@/components/providers/FavoritesProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import type { ProductSummary } from "@/lib/types";
import { ProductCard } from "./ProductCard";

const VARIANT = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";

const product: ProductSummary = {
  id: "0b9f1c7e-3f5a-4b8e-9c2d-1a2b3c4d5e6f",
  slug: "casque-test",
  title: '<img src=x onerror="alert(1)"> Casque',
  price: 80000,
  compareAtPrice: 100000,
  brand: "Marque",
  categoryId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  image: null,
  inStock: true,
  variantId: VARIANT,
  stock: 3,
  variantCount: 1,
  rating: 4.5,
  reviewCount: 12,
  isFeatured: true,
  isBestseller: false,
  isNew: false,
};

function CartCount() {
  return <span data-testid="count">{useCart().count}</span>;
}

function renderCard(p: ProductSummary = product) {
  return render(
    <ToastProvider>
      <CartProvider>
        <FavoritesProvider>
          <ProductCard product={p} badge="featured" />
          <CartCount />
        </FavoritesProvider>
      </CartProvider>
    </ToastProvider>,
  );
}

describe("<ProductCard />", () => {
  it("affiche prix, remise et badge, et échappe le titre (pas d'injection HTML)", () => {
    const { container } = renderCard();
    expect(screen.getByText(/^80\s000\sFCFA$/)).toBeInTheDocument();
    expect(screen.getByText(/-20\s%/)).toBeInTheDocument();
    expect(screen.getByText("En vedette")).toBeInTheDocument();
    expect(screen.getByText("Plus que 3 en stock")).toBeInTheDocument();
    // le titre malveillant est rendu comme du texte, aucune balise <img> n'est créée
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByRole("link", { name: /Casque/ })).toHaveAttribute(
      "href",
      "/produit/casque-test",
    );
  });

  it("ajoute au panier la variante par défaut (S3-T05)", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /Ajouter .* au panier/ }));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("kemdia.cart.v2") ?? "{}").lines?.[0]).toMatchObject({
        variantId: VARIANT,
        productId: product.id,
      }),
    );
  });

  it("plusieurs variantes : renvoie vers la fiche pour choisir, prix « dès »", () => {
    renderCard({ ...product, variantCount: 3 });
    expect(screen.queryByRole("button", { name: /Ajouter .* au panier/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Choisir une option/ })).toHaveAttribute(
      "href",
      "/produit/casque-test",
    );
    expect(screen.getByText(/^dès 80\s000\sFCFA$/)).toBeInTheDocument();
    expect(screen.queryByText(/Plus que/)).toBeNull();
  });

  it("ajoute et retire des favoris (bouton à bascule annoncé)", async () => {
    renderCard();
    const heart = screen.getByRole("button", { name: /Ajouter .* aux favoris/ });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(heart);
    expect(screen.getByRole("button", { name: /Retirer .* des favoris/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(JSON.parse(localStorage.getItem("kemdia.favorites.v1") ?? "[]")).toHaveLength(1);
  });

  it("désactive le bouton en rupture de stock", () => {
    renderCard({ ...product, stock: 0, inStock: false });
    expect(screen.getByRole("button", { name: "Rupture de stock" })).toBeDisabled();
  });
});
