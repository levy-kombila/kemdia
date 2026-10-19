import { expect, test, type Page } from "@playwright/test";
import { MAILPIT_URL, lastCode } from "./mailpit";

/**
 * Panier du compte (S5-T01, ADR-0023) : le panier du navigateur rejoint le compte à la connexion,
 * le même panier se retrouve sur un autre appareil, et il disparaît de l'écran à la déconnexion.
 * Compte neuf (inscription avec le code reçu dans Mailpit) : aucun autre test ne touche à son panier.
 */
const unique = () => `panier.${Date.now()}.${Math.floor(Math.random() * 1e6)}@exemple.ga`;
const PASSWORD = "Mangue2026";

async function localCartSize(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("kemdia.cart.v2");
    return raw ? (JSON.parse(raw) as { lines: unknown[] }).lines.length : 0;
  });
}

test.describe("panier du compte", () => {
  test.skip(!MAILPIT_URL, "boîte de test Mailpit absente (E2E_MAILPIT_URL non défini)");

  test("réuni à l'inscription, retrouvé sur un autre appareil, absent après la déconnexion", async ({
    page,
    browser,
  }) => {
    // 1. Visiteur : un article dans le panier du navigateur
    await page.goto("/recherche?q=écouteurs");
    const add = page
      .locator('button[aria-label^="Ajouter « "][aria-label$=" au panier"]:not([disabled])')
      .first();
    const title = /« (.*) »/.exec((await add.getAttribute("aria-label")) ?? "")![1]!;
    await add.click();
    await expect(page.getByText(/ajouté au panier/).first()).toBeVisible();
    expect(await localCartSize(page)).toBe(1);

    // 2. Inscription : le panier rejoint le compte, celui du navigateur est vidé
    const email = unique();
    await page.goto("/inscription");
    await page.getByLabel("Prénom").fill("Léa");
    await page.getByLabel("Nom", { exact: true }).fill("Mba");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
    await page.getByRole("checkbox", { name: /conditions générales/ }).check();
    await page.getByRole("checkbox", { name: "J'ai 18 ans ou plus." }).check();
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByText("Saisissez le code reçu")).toBeVisible();
    await page.getByLabel("Chiffre 1").click();
    await page.keyboard.insertText(await lastCode(email, "Votre code de vérification Kemdia"));
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expect(page.getByText("Bienvenue chez Kemdia, Léa !")).toBeVisible();

    await page.goto("/panier");
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
    await expect.poll(() => localCartSize(page)).toBe(0);

    // 3. Autre appareil : même compte, même panier
    const other = await browser.newContext();
    const phone = await other.newPage();
    await phone.goto("/connexion?retour=/panier");
    await phone.getByLabel("Adresse e-mail").fill(email);
    await phone.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
    await phone.getByRole("button", { name: "Se connecter" }).click();
    await expect(phone).toHaveURL(/\/panier$/);
    await expect(phone.getByRole("link", { name: title }).first()).toBeVisible();
    await other.close();

    // 4. Déconnexion : le panier du compte n'est plus affiché (il reste sur le compte)
    await page.goto("/compte");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/panier");
    await expect(page.getByRole("heading", { name: "Votre panier est vide" })).toBeVisible();
  });
});
