import { expect, test, type Page } from "@playwright/test";

/**
 * Encart du compte à droite de la bannière de l'accueil (S8-T08) : il suit la connexion et le rôle vendeur.
 * Visible sur grand écran seulement (profil « ordinateur ») ; comptes de test de e2e/fixtures/vendeur-e2e.sql.
 */
const VENDOR = { email: "vendeuse-e2e@kemdia.test", password: "E2e-Kemdia-2026" };
const CUSTOMER = { email: "sans-boutique-e2e@kemdia.test", password: "E2e-Kemdia-2026" };

test.skip(!process.env.E2E_ACCOUNT, "données de test absentes (E2E_ACCOUNT non défini)");
test.skip(({ isMobile }) => isMobile, "encart affiché sur grand écran seulement");

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto(`/connexion?retour=${encodeURIComponent("/")}`);
  await page.getByLabel("Adresse e-mail").fill(account.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
}

const hero = (page: Page) => page.locator("main section").first();

test("visiteur : se connecter et devenir vendeur", async ({ page }) => {
  await page.goto("/");
  await expect(hero(page).getByRole("link", { name: "Se connecter" })).toBeVisible();
  await expect(hero(page).getByRole("link", { name: /Devenir vendeur/ })).toBeVisible();
});

test("client connecté : ses commandes, plus de « Se connecter »", async ({ page }) => {
  await login(page, CUSTOMER);
  await expect(hero(page).getByRole("link", { name: "Mes commandes" })).toBeVisible();
  await expect(hero(page).getByRole("link", { name: "Se connecter" })).toHaveCount(0);
});

test("vendeur : « Accéder à votre boutique » ouvre l'espace vendeur", async ({ page }) => {
  await login(page, VENDOR);
  await expect(hero(page).getByRole("link", { name: /Devenir vendeur/ })).toHaveCount(0);
  await hero(page)
    .getByRole("link", { name: /Accéder à votre boutique/ })
    .click();
  await expect(page).toHaveURL(/\/vendeur/);
});
