import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
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

  test("S7.5-T08 : photo de profil — initiales, envoi recadré, en-tête, retrait", async ({
    page,
    isMobile,
  }) => {
    // Compte partagé : une seule configuration modifie sa photo
    test.skip(!isMobile, "parcours avec état : profil mobile seulement");
    await page.goto("/connexion?retour=/compte");
    await page.getByLabel("Adresse e-mail").fill(ACCOUNT.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(ACCOUNT.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/compte$/);
    await expect(page.getByText("Visible seulement par vous.")).toBeVisible();
    // Compte partagé : repartir sans photo si un essai précédent en a laissé une
    const retirer = page.getByRole("button", { name: "Retirer" });
    if (await retirer.isVisible()) {
      await retirer.click();
      await expect(page.getByText(/vos initiales s'affichent/)).toBeVisible();
    }

    const photo = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 20, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer();
    await page.getByLabel(/Ajouter une photo|Changer la photo/).setInputFiles({
      name: "moi.jpg",
      mimeType: "image/jpeg",
      buffer: photo,
    });
    await expect(page.getByText("Photo de profil enregistrée.")).toBeVisible();
    // La photo est servie par le site, au titulaire seulement, en carré de 256 px
    const img = page.locator("img[src^='/compte/photo?v=']").first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    // Lue PAR LE NAVIGATEUR (ses cookies de session), comme l'image de la page
    const served = await page.evaluate(async (url) => {
      const r = await fetch(url, { cache: "no-store" });
      return {
        status: r.status,
        type: r.headers.get("content-type"),
        cache: r.headers.get("cache-control"),
        bytes: Array.from(new Uint8Array(await r.arrayBuffer())),
      };
    }, src!);
    expect(served.status).toBe(200);
    expect(served.type).toBe("image/webp");
    expect(served.cache).toContain("private");
    expect((await sharp(Buffer.from(served.bytes)).metadata()).width).toBe(256);
    const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);

    await page.getByRole("button", { name: "Retirer" }).click();
    await expect(page.getByText(/vos initiales s'affichent/)).toBeVisible();
    await expect(page.locator("img[src^='/compte/photo?v=']")).toHaveCount(0);
  });

  test("déjà connecté : la page de connexion renvoie à la page demandée", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Adresse e-mail").fill(ACCOUNT.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(ACCOUNT.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/$/);
    // Vraie redirection HTTP (307), pas une page puis un rafraîchissement (relecture S4-T08) :
    // le navigateur suit la redirection lui-même, la requête d'origine est donc chaînée à la réponse finale.
    // (Le contexte de requête de Playwright n'envoie pas le cookie « Secure » en http : on passe par la page.)
    const response = await page.goto("/connexion?retour=/compte");
    await expect(page).toHaveURL(/\/compte$/);
    const origin = response?.request().redirectedFrom();
    expect(origin?.url()).toMatch(/\/connexion\?retour=/);
    expect((await origin?.response())?.status()).toBe(307);
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
  await page.getByRole("checkbox", { name: /conditions générales/ }).check();
  await page.getByRole("checkbox", { name: "J'ai 18 ans ou plus." }).check();
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
    await page.getByRole("checkbox", { name: /conditions générales/ }).check();
    await page.getByRole("checkbox", { name: "J'ai 18 ans ou plus." }).check();
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

    // Changer son mot de passe depuis « Mon compte » (S7-T07, ASVS 5.0 V6.2.2 et V6.2.3)
    await page.goto("/compte");
    const form = page.getByRole("form", { name: "Changer mon mot de passe" });
    await form.getByLabel("Mot de passe actuel").fill("pas le bon");
    await form.getByLabel("Nouveau mot de passe").fill("goyaves du marché");
    await form.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
    await expect(form.getByRole("alert")).toHaveText("Mot de passe incorrect.");
    await form.getByLabel("Mot de passe actuel").fill("Papaye2027");
    await form.getByLabel("Nouveau mot de passe").fill("goyaves du marché");
    await form.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
    await expect(form.getByRole("status")).toContainText("Mot de passe modifié");
    // Toujours connecté ici (nouvelle session), et le nouveau mot de passe sert à la connexion suivante
    await page.reload();
    await expect(page.getByRole("heading", { name: "Léa Mba" })).toBeVisible();
    expect((await lastEmail(email, "a été modifié")).text).toContain("déconnectés");

    // Mes données (S7-T08) : copie JSON téléchargée, puis suppression du compte
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Télécharger mes données (JSON)" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^kemdia-mes-donnees-\d{4}-\d{2}-\d{2}\.json$/);
    const copy = JSON.parse(await readFile(await file.path(), "utf8"));
    expect(copy.identite.compte.email).toBe(email);
    expect(JSON.stringify(copy)).not.toMatch(/argon2|goyaves/);

    const removal = page.getByRole("form", { name: "Supprimer mon compte" });
    await removal.getByLabel("Mot de passe actuel").fill("goyaves du marché");
    await removal.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
    await expect(removal.getByRole("alert")).toContainText("Cochez la case");
    await removal
      .getByRole("checkbox", { name: /suppression de mon compte est définitive/ })
      .check();
    await removal.getByLabel("Mot de passe actuel").fill("goyaves du marché");
    await removal.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
    await expect(page.getByText("Votre compte a été supprimé")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Espace client" })).toBeVisible();
    expect((await lastEmail(email, "a été supprimé")).text).toContain("10 ans");
    // Plus de connexion possible avec cette adresse
    await page.goto("/connexion");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("goyaves du marché");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
