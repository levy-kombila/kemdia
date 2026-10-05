import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CartProvider, useCart } from "@/components/providers/CartProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import type { Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";

const product: Product = {
  id: "42",
  slug: "casque-test",
  title: '<img src=x onerror="alert(1)"> Casque',
  description: "",
  price: 80000,
  oldPrice: 100000,
  brand: "Marque",
  categoryId: "1",
  images: [],
  stock: 3,
  rating: 4.5,
  reviewCount: 12,
  isFeatured: true,
  isBestseller: false,
  isNew: false,
  color: null,
};

function CartCount() {
  return <span data-testid="count">{useCart().count}</span>;
}

function renderCard(p: Product = product) {
  return render(
    <ToastProvider>
      <CartProvider>
        <ProductCard product={p} badge="featured" />
        <CartCount />
      </CartProvider>
    </ToastProvider>,
  );
}

describe("<ProductCard />", () => {
  it("affiche prix, remise et badge, et échappe le titre (pas d'injection HTML)", () => {
    const { container } = renderCard();
    expect(screen.getByText(/80\s000\sFCFA/)).toBeInTheDocument();
    expect(screen.getByText("-20%")).toBeInTheDocument();
    expect(screen.getByText("EN VEDETTE")).toBeInTheDocument();
    // le titre malveillant est rendu comme du texte, aucune balise <img> n'est créée
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByRole("link", { name: /Casque/ })).toHaveAttribute(
      "href",
      "/produit/casque-test",
    );
  });

  it("ajoute au panier au clic", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /Ajouter .* au panier/ }));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("désactive le bouton en rupture de stock", () => {
    renderCard({ ...product, stock: 0 });
    expect(screen.getByRole("button", { name: "Rupture de stock" })).toBeDisabled();
  });
});
