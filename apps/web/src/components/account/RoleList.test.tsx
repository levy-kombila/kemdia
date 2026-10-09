import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoleList } from "./RoleList";

describe("rôles du compte (Mon compte, S4-T06)", () => {
  it("client : un seul rôle, aucun message d'administration", () => {
    render(<RoleList roles={["client"]} />);
    const list = screen.getByRole("list", { name: "Vos rôles" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Client"]);
    expect(screen.queryByText(/administration/)).toBeNull();
  });

  it("rôles cumulés, en français ; l'équipe est prévenue que les outils arrivent", () => {
    render(<RoleList roles={["client", "vendor", "admin"]} />);
    const items = within(screen.getByRole("list", { name: "Vos rôles" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Client", "Vendeur", "Administrateur"]);
    expect(screen.getByText(/outils d'administration/)).toBeInTheDocument();
  });
});
