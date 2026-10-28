import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecondFactorSetup } from "./SecondFactorSetup";

const setup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/staff/actions", () => ({
  setupSecondFactorAction: setup,
  enableSecondFactorAction: vi.fn(),
}));
beforeEach(() => setup.mockReset());

describe("activation de la double authentification (S9-T01)", () => {
  it("sans mot de passe : un message explique quoi saisir, rien n'est envoyé", async () => {
    render(<SecondFactorSetup />);
    expect(screen.getByText(/aucun mot de passe n'est envoyé par e-mail/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Afficher le QR code" }));
    expect(
      screen.getByText(/Saisissez le mot de passe de votre compte Kemdia/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Mot de passe", { exact: true })).toHaveFocus();
    expect(setup).not.toHaveBeenCalled();
  });

  it("avec le mot de passe : le message disparaît et la demande part", async () => {
    setup.mockResolvedValue({ ok: false, message: "Mot de passe incorrect." });
    render(<SecondFactorSetup />);
    await userEvent.click(screen.getByRole("button", { name: "Afficher le QR code" }));
    await userEvent.type(screen.getByLabelText("Mot de passe", { exact: true }), "Mangue2026");
    expect(screen.queryByText(/Saisissez le mot de passe/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Afficher le QR code" }));
    expect(setup).toHaveBeenCalledWith("Mangue2026");
    expect(await screen.findByText("Mot de passe incorrect.")).toBeInTheDocument();
    // Le mot de passe ne reste pas dans la page après l'envoi
    expect(screen.getByLabelText("Mot de passe", { exact: true })).toHaveValue("");
  });
});
