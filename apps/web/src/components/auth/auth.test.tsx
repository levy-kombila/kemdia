import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { OtpInput } from "./OtpInput";
import { SignupForm } from "./SignupForm";

// Adaptateur de démonstration sans délai artificiel pour des tests rapides
vi.mock("@/lib/auth/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/auth/client")>();
  return { ...mod, authClient: mod.createDemoAuthClient(0) };
});

function ControlledOtp() {
  const [value, setValue] = useState("");
  return (
    <>
      <OtpInput value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("OtpInput", () => {
  it("accepte un code collé et ignore les caractères non numériques", async () => {
    const user = userEvent.setup();
    render(<ControlledOtp />);
    await user.click(screen.getByLabelText("Chiffre 1"));
    await user.paste("12-34 56");
    expect(screen.getByTestId("value")).toHaveTextContent("123456");
  });

  it("efface chiffre par chiffre avec la touche retour", async () => {
    const user = userEvent.setup();
    render(<ControlledOtp />);
    await user.click(screen.getByLabelText("Chiffre 1"));
    await user.keyboard("123{Backspace}");
    expect(screen.getByTestId("value")).toHaveTextContent(/^12$/);
  });
});

describe("Inscription", () => {
  it("signale les champs invalides sans rien envoyer", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));
    expect(screen.getByLabelText("Prénom")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Numéro de téléphone")).toHaveAccessibleDescription(
      /Numéro Airtel/,
    );
    expect(screen.getByText(/accepter les conditions/)).toBeInTheDocument();
    expect(screen.getByLabelText("Prénom")).toHaveFocus();
  });

  it("parcours complet : formulaire → code SMS → compte vérifié", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(screen.getByLabelText("Prénom"), "Marie");
    await user.type(screen.getByLabelText("Nom"), "Nze");
    await user.type(screen.getByLabelText("Numéro de téléphone"), "077 12 34 56");
    await user.type(screen.getByLabelText("Mot de passe"), "Libreville2026");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));

    expect(await screen.findByText("Saisissez le code reçu")).toBeInTheDocument();
    expect(screen.getByText("077 •• •• 56")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Chiffre 1"));
    await user.paste("000000");
    await user.click(screen.getByRole("button", { name: "Vérifier" }));
    expect(await screen.findByText(/Code incorrect/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Chiffre 1"));
    await user.paste("123456");
    await user.click(screen.getByRole("button", { name: "Vérifier" }));
    expect(await screen.findByText("Bienvenue chez Kemdia, Marie !")).toBeInTheDocument();
    expect(screen.getByText(/077 12 34 56 est vérifié/)).toBeInTheDocument();
  });

  it("bascule vers l'e-mail", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.click(screen.getByRole("radio", { name: /E-mail/ }));
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute("autocomplete", "email");
  });
});

describe("Connexion", () => {
  it("refuse un identifiant invalide", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/compte" />);
    await user.type(screen.getByLabelText("E-mail ou numéro de téléphone"), "0123");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(screen.getByLabelText("E-mail ou numéro de téléphone")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("explique que la connexion arrive au Sprint 4 et efface le mot de passe", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/compte" />);
    await user.type(screen.getByLabelText("E-mail ou numéro de téléphone"), "marie@exemple.ga");
    await user.type(screen.getByLabelText("Mot de passe"), "Libreville2026");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText(/connexion sera active au Sprint 4/)).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toHaveValue("");
  });

  it("permet d'afficher le mot de passe", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/compte" />);
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "text");
  });
});

describe("Mot de passe oublié", () => {
  it("identifiant → code → nouveau mot de passe", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("E-mail ou numéro de téléphone"), "066 12 34 56");
    await user.click(screen.getByRole("button", { name: "Recevoir un code" }));
    await user.click(await screen.findByLabelText("Chiffre 1"));
    await user.paste("123456");
    await user.click(screen.getByRole("button", { name: "Vérifier" }));
    await user.type(await screen.findByLabelText("Nouveau mot de passe"), "azerty123");
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(screen.getByText(/trop courant/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Nouveau mot de passe"));
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "Owendo2026!");
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(await screen.findByText("Mot de passe modifié")).toBeInTheDocument();
  });
});
