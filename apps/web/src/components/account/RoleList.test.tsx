import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoleList } from "./RoleList";

describe("rôles du compte (Mon compte, S4-T06)", () => {
  it("client : un seul rôle, aucun lien vers l'espace de l'équipe", () => {
    render(<RoleList roles={["client"]} />);
    const list = screen.getByRole("list", { name: "Vos rôles" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Client"]);
    expect(screen.queryByRole("link", { name: /espace de l'équipe/ })).toBeNull();
  });

  it("rôles cumulés, en français ; l'équipe a un lien vers son espace (S6-T05)", () => {
    render(<RoleList roles={["client", "vendor", "admin"]} />);
    const items = within(screen.getByRole("list", { name: "Vos rôles" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Client", "Vendeur", "Administrateur"]);
    expect(screen.getByRole("link", { name: /espace de l'équipe/ })).toHaveAttribute(
      "href",
      "/equipe",
    );
  });

  it("vendeur seul : espace vendeur (S6-T06), pas d'espace de l'équipe", () => {
    render(<RoleList roles={["client", "vendor"]} />);
    expect(screen.queryByRole("link", { name: /espace de l'équipe/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Mon espace vendeur" })).toHaveAttribute(
      "href",
      "/vendeur",
    );
  });
});
