import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoBanner } from "./DemoBanner";

describe("<DemoBanner /> (S5-T08)", () => {
  it("dit que rien n'est réel et mène au mode d'emploi", () => {
    render(<DemoBanner />);
    expect(screen.getByText(/aucun vrai paiement/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tester un achat" })).toHaveAttribute("href", "/demo");
  });
});
