import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MAILPIT_URL, lastCode, lastEmail } from "./mailpit";

/**
 * Identité branchée sur la vraie API (S4-T05) : connexion, cookie protégé, en-tête, « Mon compte »,
 * déconnexion ; et, quand la boîte de test Mailpit est là (CI), les parcours complets avec le code reçu.
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
    // Rôles lus dans l'API (S4-T06) : un compte inscrit est client
    await expect(page.getByRole("list", { name: "Vos rôles" })).toHaveText("Client");
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

test.describe("parcours complets avec l'e-mail reçu (Mailpit)", () => {
  test.skip(!MAILPIT_URL, "boîte de test Mailpit absente (E2E_MAILPIT_URL non défini)");

  const typeCode = async (page: Page, code: string) => {
    await page.getByLabel("Chiffre 1").click();
    await page.keyboard.insertText(code);
  };

  test("inscription → code reçu → connecté ; puis mot de passe oublié → nouveau mot de passe", async ({
    page,
    browser,
  }) => {
    const email = unique("parcours");
    await page.goto("/inscription");
    await page.getByLabel("Prénom").fill("Léa");
    await page.getByLabel("Nom", { exact: true }).fill("Mba");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("Mangue2026");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByText("Saisissez le code reçu")).toBeVisible();

    await typeCode(page, await lastCode(email, "Votre code de vérification Kemdia"));
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expect(page.getByText("Bienvenue chez Kemdia, Léa !")).toBeVisible();
    await expect(page.getByRole("button", { name: /Léa/ })).toBeVisible();
    await page.goto("/compte");
    await expect(page.getByRole("heading", { name: "Léa Mba" })).toBeVisible();

    // Mot de passe oublié depuis un autre appareil : celui-ci est déconnecté
    const other = await browser.newContext();
    const phone = await other.newPage();
    await phone.goto("/mot-de-passe-oublie");
    await phone.getByLabel("Adresse e-mail").fill(email);
    await phone.getByRole("button", { name: "Recevoir un code" }).click();
    await expect(phone.getByText("Saisissez le code reçu")).toBeVisible();
    await typeCode(phone, await lastCode(email, "Votre code pour changer de mot de passe"));
    await phone.getByRole("button", { name: "Continuer" }).click();
    await phone.getByLabel("Nouveau mot de passe").fill("Papaye2027");
    await phone.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
    await expect(phone.getByText("Mot de passe modifié")).toBeVisible();
    expect((await lastEmail(email, "a été modifié")).text).toContain("déconnectés");
    await other.close();

    await page.goto("/compte");
    await expect(page.getByRole("heading", { name: "Espace client" })).toBeVisible();
    await page.goto("/connexion");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("Papaye2027");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("button", { name: /Léa/ })).toBeVisible();
  });
});
