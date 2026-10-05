import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "@/components/providers/CartProvider";
import { MobileTabBar } from "./MobileTabBar";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

function renderBar() {
  return render(
    <CartProvider>
      <MobileTabBar />
    </CartProvider>,
  );
}

describe("<MobileTabBar />", () => {
  beforeEach(() => {
    nav.pathname = "/";
  });

  it("indique l'onglet actif", () => {
    nav.pathname = "/inscription";
    renderBar();
    expect(screen.getByRole("link", { name: "Compte" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Accueil" })).not.toHaveAttribute("aria-current");
  });

  it("laisse la place à la barre d'achat sur la fiche produit", () => {
    nav.pathname = "/produit/casque";
    renderBar();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
