import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroAccountPanel } from "./Hero";

const link = (name: string) => screen.queryByRole("link", { name: new RegExp(name) });

describe("<HeroAccountPanel /> (S8-T08 : encart du compte selon le visiteur)", () => {
  it("visiteur : se connecter, créer un compte, devenir vendeur", () => {
    render(<HeroAccountPanel account={null} />);
    expect(screen.getByText("Bienvenue sur Kemdia")).toBeInTheDocument();
    expect(link("Se connecter")).toHaveAttribute("href", "/connexion");
    expect(link("Créer un compte")).toHaveAttribute("href", "/inscription");
    expect(link("Devenir vendeur")).toHaveAttribute("href", "/vendre");
  });

  it("client connecté : plus de « Se connecter », ses commandes et son compte", () => {
    render(<HeroAccountPanel account={{ firstName: "Awa", vendor: false }} />);
    expect(screen.getByText("Bonjour, Awa")).toBeInTheDocument();
    expect(link("Se connecter")).toBeNull();
    expect(link("Créer un compte")).toBeNull();
    expect(link("Mes commandes")).toHaveAttribute("href", "/compte/commandes");
    expect(link("Mon compte")).toHaveAttribute("href", "/compte");
    // Pas encore vendeur : l'invitation à vendre reste
    expect(link("Devenir vendeur")).toHaveAttribute("href", "/vendre");
  });

  it("vendeur : « Accéder à votre boutique » mène à l'espace vendeur", () => {
    render(<HeroAccountPanel account={{ firstName: "Awa", vendor: true }} />);
    expect(link("Devenir vendeur")).toBeNull();
    expect(link("Accéder à votre boutique")).toHaveAttribute("href", "/vendeur");
    expect(link("Se connecter")).toBeNull();
  });
});
