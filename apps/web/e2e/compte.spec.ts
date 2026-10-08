import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Identité branchée sur la vraie API (S4-T05). En CI, l'API n'envoie pas d'e-mails : le parcours complet
 * (code reçu) est vérifié par les tests de l'API et par l'essai réel du rapport ; ici, on vérifie ce que
 * le navigateur voit : connexion, cookie protégé, en-tête, « Mon compte », déconnexion.
 *
 * Le compte de test est inséré par la CI dans sa base éphémère (e2e/fixtures/compte-e2e.sql) ;
 * sur un poste sans ce compte, les tests qui en ont besoin sont sautés.
 */
const ACCOUNT = { email: "e2e@kemdia.test", password: "E2e-Kemdia-2026" };
const withAccount = !!process.env.E2E_ACCOUNT;
const unique = (label: string) =>
  `${label}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@exemple.ga`;

test.describe("compte client", () => {
  test.skip(!withAccount, "compte de test absent (E2E_ACCOUNT non défini)");

  test("connexion depuis le panier → retour au panier, cookie protégé, « Mon compte », déconnexion", async ({
    page,
    context,
  }) => {
    await page.goto("/panier");
    await page.getByRole("link", { name: "Se connecter" }).first().click();
    await expect(page).toHaveURL(/\/connexion\?retour=%2Fpanier$/);

    await page.getByLabel("Adresse e-mail").fill(ACCOUNT.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(ACCOUNT.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/panier$/);
    await expect(page.getByRole("button", { name: /Awa/ })).toBeVisible();

    const session = (await context.cookies()).find((c) => c.name.endsWith("kemdia_session"));
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    expect(session?.name).toBe("__Host-kemdia_session");
    expect(await page.evaluate(() => document.cookie)).not.toContain("kemdia_session");

    await page.goto("/compte");
    await expect(page.getByRole("heading", { name: "Awa Testeuse" })).toBeVisible();
    const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);

    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Se connecter" }).first()).toBeVisible();
    expect((await context.cookies()).some((c) => c.name.endsWith("kemdia_session"))).toBe(false);
  });

  test("déjà connecté : la page de connexion renvoie à la page demandée", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Adresse e-mail").fill(ACCOUNT.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(ACCOUNT.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/connexion?retour=/compte");
    await expect(page).toHaveURL(/\/compte$/);
  });
});

test("mauvais mot de passe : message neutre (identique pour une adresse inconnue)", async ({
  page,
}) => {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(unique("inconnu"));
  await page.getByLabel("Mot de passe", { exact: true }).fill("Mauvais2026");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("");
});

test("inscription : l'API répond, l'écran du code s'affiche, le ticket reste côté serveur", async ({
  page,
  context,
}) => {
  await page.goto("/inscription");
  await expect(page.getByRole("radio", { name: /SMS/ })).toBeDisabled();
  const email = unique("nouveau");
  await page.getByLabel("Prénom").fill("Léa");
  await page.getByLabel("Nom", { exact: true }).fill("Mba");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("Mangue2026");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Saisissez le code reçu")).toBeVisible();
  await expect(page.getByText(/^no•••@exemple\.ga$/)).toBeVisible();
  const ticket = (await context.cookies()).find((c) => c.name.endsWith("kemdia_inscription"));
  expect(ticket).toMatchObject({ httpOnly: true, sameSite: "Lax" });

  // Mauvais code : refusé par l'API
  await page.getByLabel("Chiffre 1").click();
  await page.keyboard.insertText("000000");
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page.getByText(/Code incorrect/)).toBeVisible();
});

test("mot de passe oublié : même écran du code pour une adresse sans compte", async ({ page }) => {
  await page.goto("/mot-de-passe-oublie");
  await page.getByLabel("Adresse e-mail").fill(unique("personne"));
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  await expect(page.getByText("Saisissez le code reçu")).toBeVisible();
});
