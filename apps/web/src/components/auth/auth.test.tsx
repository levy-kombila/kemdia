import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_CODE, createFakeAuthClient } from "@/lib/auth/test-fake-auth";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { OtpInput } from "./OtpInput";
import { SignupForm } from "./SignupForm";

// Faux client d'identité (l'API est testée à part) et navigation de Next.js
const fake = vi.hoisted(() => ({ client: null as null | ReturnType<typeof createFakeAuthClient> }));
vi.mock("@/lib/auth/client", () => ({
  get authClient() {
    return fake.client;
  },
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeEach(() => {
  fake.client = createFakeAuthClient();
  refresh.mockClear();
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

const typeCode = async (user: ReturnType<typeof userEvent.setup>, code: string) => {
  await user.click(screen.getByLabelText("Chiffre 1"));
  await user.paste(code);
};

describe("Inscription", () => {
  it("signale les champs invalides sans rien envoyer", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));
    expect(screen.getByLabelText("Prénom")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAccessibleDescription(/invalide/);
    expect(screen.getByText(/accepter les conditions/)).toBeInTheDocument();
    // S7-T08 : « 18 ans ou plus » obligatoire, case distincte
    expect(screen.getByText(/réservé aux personnes de 18 ans ou plus/)).toBeInTheDocument();
    expect(screen.getByLabelText("Prénom")).toHaveFocus();
    expect(fake.client!.calls).toEqual([]);
  });

  it("e-mail par défaut ; le SMS est « bientôt » et ne peut pas être choisi", () => {
    render(<SignupForm />);
    expect(screen.getByRole("radio", { name: /E-mail/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /SMS/ })).toBeDisabled();
    expect(screen.getAllByText(/bientôt/).length).toBeGreaterThan(0);
  });

  async function fillSignup(user: ReturnType<typeof userEvent.setup>, password = "Libreville2026") {
    await user.type(screen.getByLabelText("Prénom"), "Marie");
    await user.type(screen.getByLabelText("Nom"), "Nze");
    await user.type(screen.getByLabelText("Adresse e-mail"), "Marie@Exemple.ga");
    await user.type(screen.getByLabelText("Mot de passe"), password);
    await user.click(screen.getByRole("checkbox", { name: /conditions générales/ }));
    await user.click(screen.getByRole("checkbox", { name: "J'ai 18 ans ou plus." }));
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));
  }

  it("parcours complet : formulaire → code par e-mail → connecté", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await fillSignup(user);

    expect(await screen.findByText("Saisissez le code reçu")).toBeInTheDocument();
    // Destination masquée renvoyée par l'API, adresse normalisée envoyée
    expect(screen.getByText("ma•••@exemple.ga")).toBeInTheDocument();
    expect(fake.client!.calls).toEqual(["signup:marie@exemple.ga"]);

    await typeCode(user, "000000");
    await user.click(screen.getByRole("button", { name: "Vérifier" }));
    expect(await screen.findByText(/Code incorrect/)).toBeInTheDocument();

    await typeCode(user, FAKE_CODE);
    await user.click(screen.getByRole("button", { name: "Vérifier" }));
    expect(await screen.findByText("Bienvenue chez Kemdia, Marie !")).toBeInTheDocument();
    expect(
      screen.getByText(/marie@exemple.ga est vérifiée et vous êtes connecté/),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("mot de passe refusé par le serveur : message sous le champ", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await fillSignup(user, "Refuse2026");
    expect(await screen.findByLabelText("Mot de passe")).toHaveAccessibleDescription(/refusé/);
  });
});

describe("Connexion", () => {
  it("refuse un identifiant invalide sans rien envoyer", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "0123");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute("aria-invalid", "true");
    expect(fake.client!.calls).toEqual([]);
  });

  it("téléphone : « bientôt disponible »", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "077 12 34 56");
    await user.type(screen.getByLabelText("Mot de passe"), "Mangue2026");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAccessibleDescription(
      /bientôt disponible/,
    );
    expect(fake.client!.calls).toEqual([]);
  });

  it("mauvais mot de passe : message neutre, mot de passe effacé", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "awa@exemple.ga");
    await user.type(screen.getByLabelText("Mot de passe"), "Faux2026");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText("Identifiant ou mot de passe incorrect.")).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toHaveValue("");
  });

  it("blocage : délai affiché et lien vers « mot de passe oublié »", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "awa@exemple.ga");
    await user.type(screen.getByLabelText("Mot de passe"), "Bloque2026");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText(/Réessayez dans 15 minutes/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Choisir un nouveau mot de passe" }),
    ).toBeInTheDocument();
  });

  it("bon mot de passe : retour à la page d'avant", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const user = userEvent.setup();
    render(<LoginForm returnTo="/panier" />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "awa@exemple.ga");
    await user.type(screen.getByLabelText("Mot de passe"), "Mangue2026");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/panier"));
    vi.unstubAllGlobals();
  });

  it("affiche l'avis « déconnecté de tous vos appareils »", () => {
    render(<LoginForm returnTo="/" notice="Vous avez été déconnecté de tous vos appareils." />);
    expect(screen.getByRole("status")).toHaveTextContent(/tous vos appareils/);
  });

  it("permet d'afficher le mot de passe", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="/" />);
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "text");
  });
});

describe("Mot de passe oublié", () => {
  async function requestCode(user: ReturnType<typeof userEvent.setup>, email = "awa@exemple.ga") {
    await user.type(screen.getByLabelText("Adresse e-mail"), email);
    await user.click(screen.getByRole("button", { name: "Recevoir un code" }));
    await screen.findByText("Saisissez le code reçu");
  }

  it("e-mail → code → nouveau mot de passe → connecté", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await requestCode(user);
    await typeCode(user, FAKE_CODE);
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.type(await screen.findByLabelText("Nouveau mot de passe"), "azerty123");
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(screen.getByText(/trop courant/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Nouveau mot de passe"));
    await user.type(screen.getByLabelText("Nouveau mot de passe"), "Owendo2026!");
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(await screen.findByText("Mot de passe modifié")).toBeInTheDocument();
    expect(screen.getByText(/autres appareils ont été déconnectés/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("code faux (vérifié avec le mot de passe) : retour à l'étape du code avec le message", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await requestCode(user);
    await typeCode(user, "111111");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.type(await screen.findByLabelText("Nouveau mot de passe"), "Owendo2026!");
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(await screen.findByText(/Code incorrect/)).toBeInTheDocument();
    expect(screen.getByText("Saisissez le code reçu")).toBeInTheDocument();
  });

  it("téléphone : bientôt disponible", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "066 12 34 56");
    await user.click(screen.getByRole("button", { name: "Recevoir un code" }));
    expect(await screen.findByLabelText("Adresse e-mail")).toHaveAccessibleDescription(
      /SMS sera bientôt disponible/,
    );
  });
});
