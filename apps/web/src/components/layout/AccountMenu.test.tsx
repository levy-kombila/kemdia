import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu";

let pathname = "/panier";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/lib/auth/actions", () => ({
  logoutAction: vi.fn(),
  clearStaleSessionAction: vi.fn(() => Promise.resolve()),
}));

describe("menu du compte (en-tête)", () => {
  it("visiteur : « Se connecter », avec retour à la page en cours", () => {
    render(<AccountMenu account={null} />);
    expect(screen.getByRole("link", { name: /Se connecter/ })).toHaveAttribute(
      "href",
      "/connexion?retour=%2Fpanier",
    );
  });

  it("depuis l'accueil : pas de paramètre de retour", () => {
    pathname = "/";
    render(<AccountMenu account={null} />);
    expect(screen.getByRole("link", { name: /Se connecter/ })).toHaveAttribute(
      "href",
      "/connexion",
    );
    pathname = "/panier";
  });

  it("connecté : « Bonjour, Awa » ; le menu s'ouvre et se ferme avec Échap", async () => {
    const user = userEvent.setup();
    render(<AccountMenu account={{ firstName: "Awa", lastName: "Ndong", avatar: null }} />);
    const button = screen.getByRole("button", { name: /Awa/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Bonjour,")).toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Mon compte" })).toHaveAttribute("href", "/compte");
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Mon compte" })).not.toBeInTheDocument();
  });

  it("le focus quitte le menu (Tab) : il se ferme", async () => {
    const user = userEvent.setup();
    render(
      <>
        <AccountMenu account={{ firstName: "Awa", lastName: "Ndong", avatar: null }} />
        <a href="/suite">Lien suivant</a>
      </>,
    );
    const button = screen.getByRole("button", { name: /Awa/ });
    await user.click(button);
    expect(button).toHaveAttribute("aria-controls");
    await user.tab(); // Mon compte
    await user.tab(); // Se déconnecter
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.tab(); // hors du menu
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveAttribute("aria-controls");
  });
});

describe("menu du compte : en-tête de réserve (S4-T08)", () => {
  it("pendant l'attente de l'API : emplacement réservé, rien de cliquable ni d'annoncé", () => {
    const { container } = render(<AccountMenu account="loading" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("liens des espaces selon les rôles : vendeur (espace, commandes), équipe ; rien pour un client", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <AccountMenu account={{ firstName: "Awa", lastName: "Ndong", avatar: null }} />,
    );
    await user.click(screen.getByRole("button", { name: /Awa/ }));
    expect(screen.queryByRole("link", { name: "Espace vendeur" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /équipe/ })).not.toBeInTheDocument();
    unmount();
    render(
      <AccountMenu
        account={{ firstName: "Fatou", lastName: "Ndong", avatar: null, vendor: true, staff: true }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Fatou/ }));
    expect(screen.getByRole("link", { name: "Espace vendeur" })).toHaveAttribute(
      "href",
      "/vendeur",
    );
    expect(screen.getByRole("link", { name: "Commandes à traiter" })).toHaveAttribute(
      "href",
      "/vendeur/commandes",
    );
    expect(screen.getByRole("link", { name: "Espace de l'équipe" })).toHaveAttribute(
      "href",
      "/equipe",
    );
  });
});
