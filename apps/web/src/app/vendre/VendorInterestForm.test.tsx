import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { VendorInterestForm } from "./VendorInterestForm";

describe("<VendorInterestForm />", () => {
  it("signale les champs manquants puis confirme une demande complète", async () => {
    const user = userEvent.setup();
    render(<VendorInterestForm />);
    await user.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(screen.getByLabelText("Prénom et nom")).toHaveAttribute("aria-invalid", "true");

    await user.type(screen.getByLabelText("Prénom et nom"), "Paul Ondo");
    await user.type(screen.getByLabelText("Nom de la boutique"), "Ondo Électronique");
    await user.type(screen.getByLabelText("Téléphone"), "066 12 34 56");
    await user.selectOptions(screen.getByLabelText("Ville"), "port-gentil");
    await user.selectOptions(screen.getByLabelText("Ce que vous vendez"), "High-Tech");
    await user.click(screen.getByRole("button", { name: "Envoyer ma demande" }));
    expect(await screen.findByText(/Merci Paul/)).toBeInTheDocument();
    expect(screen.getByText(/n'est pas encore transmise/)).toBeInTheDocument();
  });
});
