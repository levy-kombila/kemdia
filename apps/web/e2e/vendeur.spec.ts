import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * Espace vendeur (S6-T06, ADR-0037), branché sur la vraie API : demande de boutique, produit avec deux variantes,
 * photo réduite dans le navigateur puis envoyée, prix et stock, retrait et remise en vente ; « Mes commandes » (S6-T07).
 *
 * Données insérées par la CI dans sa base éphémère (e2e/fixtures/vendeur-e2e.sql) ; sans elles, ces tests sont sautés.
 * Les parcours changent l'état de la base : ils ne tournent que sur le profil « mobile » (les vendeurs travaillent
 * surtout depuis leur téléphone), en série.
 */
const VENDOR = { email: "vendeuse-e2e@kemdia.test", password: "E2e-Kemdia-2026" };
const NO_SHOP = { email: "sans-boutique-e2e@kemdia.test", password: "E2e-Kemdia-2026" };
/** Produit validé de la boutique « Atelier E2E » (un autre vendeur) : photos-vendeur-e2e.sql */
const OTHER_PRODUCT = "0e2e0000-0000-4000-8000-0000000000b1";
const withData = !!process.env.E2E_ACCOUNT;

async function login(page: Page, account: { email: string; password: string }, returnTo: string) {
  await page.goto(`/connexion?retour=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Adresse e-mail").fill(account.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === returnTo);
}

async function expectAccessible(page: Page) {
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual(
    [],
  );
}

/** Photo de téléphone simulée : 3 000 × 2 000 px (elle sera réduite à 1 600 px avant l'envoi). */
async function phonePhoto(): Promise<Buffer> {
  return sharp({
    create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 60, b: 40 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

test.describe("espace vendeur : accès", () => {
  test("sans connexion : la page de connexion, puis retour à l'espace vendeur", async ({
    page,
  }) => {
    await page.goto("/vendeur/produits");
    await expect(page).toHaveURL(/\/connexion\?retour=%2Fvendeur%2Fproduits$/);
  });

  test("envoi de photo : refusé sans session, et d'un autre site (CSRF)", async ({ request }) => {
    const url = `/vendeur/produits/${OTHER_PRODUCT}/photos`;
    // Sans en-tête Origin : arrêté par proxy.ts avant d'arriver à la route
    expect((await request.post(url, { data: "x" })).status()).toBe(403);
    const response = await request.post(url, {
      data: "x",
      headers: { origin: "https://pirate.example" },
    });
    expect(response.status()).toBe(403);
  });
});

test.describe("espace vendeur : parcours", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!withData, "données de test absentes (E2E_ACCOUNT non défini)");
  test.skip(({ isMobile }) => !isMobile, "parcours avec état : profil mobile seulement");

  test("sans boutique : la demande est vérifiée puis envoyée ; la boutique attend l'examen", async ({
    page,
  }) => {
    await login(page, NO_SHOP, "/vendeur");
    await expect(page.getByRole("heading", { name: "Ouvrir ma boutique", level: 1 })).toBeVisible();
    await expectAccessible(page);

    const form = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Envoyer ma demande" }) });
    await form.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(form.getByLabel("Nom de la boutique")).toHaveAttribute("aria-invalid", "true");

    await form.getByLabel("Nom de la boutique").fill("Couture Sansboutique E2E");
    await form.getByLabel("Ville", { exact: true }).fill("Oyem");
    await form.getByLabel("Mobile de contact").fill("077 98 76 54");
    await form
      .getByLabel("Ce que vous vendez")
      .fill("Robes et chemises cousues à la main, en pagne wax.");
    await form.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(page).toHaveURL(/\/vendeur\?ok=demande-envoyee$/);
    await expect(page.getByText("Demande en cours d'examen")).toBeVisible();
    await expect(page.getByText("077 98 76 54")).toBeVisible();
    // Sans boutique active, pas de produits
    await page.goto("/vendeur/produits");
    await expect(page).toHaveURL(/\/vendeur$/);
  });

  test("boutique active : produit, photo réduite, prix et stock, retrait et remise en vente", async ({
    page,
  }) => {
    await login(page, VENDOR, "/vendeur");
    await expect(
      page.getByRole("heading", { name: "Boutique de Fatou E2E", level: 1 }),
    ).toBeVisible();
    await expectAccessible(page);

    // --- Nouveau produit, deux variantes ---
    await page.getByRole("link", { name: "Ajouter un produit" }).first().click();
    await expect(page).toHaveURL(/\/vendeur\/produits\/nouveau$/);
    // Chercher d'abord (S7.5-T03) : rien d'approchant en ligne, le vendeur crée une nouvelle fiche
    await page.getByLabel("Nom du produit").fill("Chemise en pagne E2E");
    await page.getByRole("button", { name: "Chercher", exact: true }).click();
    await expect(page.getByText(/Aucun produit trouvé/)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: "Créer une nouvelle fiche" }).click();
    await expect(page).toHaveURL(/\/vendeur\/produits\/nouveau\?creer=1$/);
    await page.getByRole("button", { name: /Créer le produit/ }).click();
    await expect(page.getByLabel("Titre")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Titre").fill("Chemise en pagne E2E");
    await page.getByRole("combobox", { name: "Catégorie" }).selectOption({ index: 2 });
    await page
      .getByLabel("Description")
      .fill("Chemise homme en pagne wax, coton, coupe droite, manches courtes.");
    await page.getByLabel("Nom (couleur, taille…)").fill("Taille M");
    await page.getByLabel("Prix (FCFA)").fill("15 000");
    await page.getByLabel("Stock").fill("4");
    await page.getByRole("button", { name: "Ajouter une variante" }).click();
    await page.getByLabel("Nom (couleur, taille…)").nth(1).fill("Taille L");
    await page.getByLabel("Prix (FCFA)").nth(1).fill("16000");
    await page.getByLabel("Prix barré (facultatif)").nth(1).fill("15000");
    await page.getByLabel("Stock").nth(1).fill("2");
    await page.getByRole("button", { name: /Créer le produit/ }).click();
    // Prix barré plus bas que le prix : refusé avant tout envoi
    await expect(page.getByText("Le prix barré doit être plus élevé que le prix.")).toBeVisible();
    await page.getByLabel("Prix barré (facultatif)").nth(1).fill("");
    await page.getByRole("button", { name: /Créer le produit/ }).click();

    await expect(page).toHaveURL(/\/vendeur\/produits\/[0-9a-f-]{36}\?ok=produit-cree$/);
    await expect(
      page.getByRole("heading", { name: "Chemise en pagne E2E", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("En attente de validation")).toBeVisible();
    await expect(page.getByText("Invisible des clients")).toBeVisible();
    await expectAccessible(page);

    // --- Photo de 3 000 px réduite dans le navigateur, puis envoyée ---
    // Le fichier qui part vers le site : déjà réduit à 1 600 px par le navigateur
    let sentSide = 0;
    await page.route(/\/vendeur\/produits\/[0-9a-f-]{36}\/photos$/, async (route) => {
      const body = route.request().postDataBuffer();
      if (body) {
        const meta = await sharp(body).metadata();
        sentSide = Math.max(meta.width ?? 0, meta.height ?? 0);
      }
      await route.continue();
    });
    await page.getByLabel("Ajouter des photos").setInputFiles({
      name: "photo-telephone.jpg",
      mimeType: "image/jpeg",
      buffer: await phonePhoto(),
    });
    await expect(page).toHaveURL(/\?ok=photo-ajoutee$/);
    expect(sentSide).toBe(1600);
    const photo = page.getByRole("img", { name: "Photo 1 (principale)" });
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBe(1600);
    // Aperçu réservé au vendeur, jamais en cache
    const preview = await page.request.get((await photo.getAttribute("src"))!);
    expect(preview.headers()["cache-control"]).toBe("private, no-store");

    // --- Prix et stock d'une variante (sans nouvelle modération) ---
    const variant = page.locator("form").filter({ hasText: "Taille M" });
    await variant.getByLabel("Stock").fill("9");
    await variant.getByLabel("Prix (FCFA)").fill("14500");
    await variant.getByRole("button", { name: /Enregistrer/ }).click();
    await expect(page).toHaveURL(/\?ok=variante-modifiee$/);
    await expect(page.locator("form").filter({ hasText: "Taille M" })).toContainText("stock 9");

    // --- Retrait d'une photo : demande une confirmation ---
    await page.getByText("Retirer…").first().click();
    await page.getByRole("button", { name: /Retirer définitivement/ }).click();
    await expect(page).toHaveURL(/\?ok=photo-retiree$/);
    await expect(page.getByRole("heading", { name: "Photos (0/10)" })).toBeVisible();

    // --- Retrait de la vente, puis remise en vente ---
    await page.getByText("Retirer ce produit de la vente…").click();
    await page.getByRole("button", { name: "Retirer de la vente" }).click();
    await expect(page).toHaveURL(/\?ok=produit-archive$/);
    await expect(page.getByText("Retiré de la vente").first()).toBeVisible();
    await page.getByRole("button", { name: "Remettre en vente" }).click();
    await expect(page).toHaveURL(/\?ok=produit-remis$/);
    await expect(page.getByText("En attente de validation")).toBeVisible();

    // --- Liste « Mes produits » ---
    await page
      .getByRole("navigation", { name: "Espace vendeur" })
      .getByRole("link", { name: "Mes produits" })
      .click();
    await expect(page.getByRole("link", { name: /Chemise en pagne E2E/ })).toBeVisible();
    await expectAccessible(page);

    // Produit d'un autre vendeur : introuvable
    const other = await page.goto(`/vendeur/produits/${OTHER_PRODUCT}`);
    expect(other?.status()).toBe(404);
  });

  test("mes commandes (S6-T07) : liste par statut, accessible ; commande d'une autre boutique introuvable", async ({
    page,
  }) => {
    await login(page, VENDOR, "/vendeur/commandes");
    await expect(page.getByRole("heading", { name: "Mes commandes", level: 1 })).toBeVisible();
    await expect(page.getByText("dans les 24 heures")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: "À traiter" }).click();
    await expect(page).toHaveURL(/\/vendeur\/commandes\?statut=pending$/);
    await expect(page.getByRole("link", { name: "À traiter" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Accès aux commandes vérifié par l'API (boutique du compte) : une référence inconnue donne 404
    const unknown = await page.goto("/vendeur/commandes/KMD-ZZZZ22");
    expect(unknown?.status()).toBe(404);
    const malformed = await page.goto("/vendeur/commandes/..%2F..%2Fadmin");
    expect(malformed?.status()).toBe(404);
  });

  test("vérification (S6-T08) : dossier, photos réduites, envoi ; accessible", async ({ page }) => {
    await login(page, VENDOR, "/vendeur/verification");
    await expect(
      page.getByRole("heading", { name: "Vérification de la boutique", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Pas encore commencée")).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Nom tel qu'il est écrit sur la pièce").fill("Fatou Vendeuse");
    await page.getByLabel("Numéro de la pièce").fill("GA 1234 5678");
    await page.getByLabel("Numéro du compte").fill("066 76 54 32");
    await page.getByLabel("Titulaire du compte").fill("Fatou Vendeuse");
    await page.getByRole("button", { name: "Enregistrer le dossier" }).click();
    // Airtel choisi par défaut, numéro Moov : refusé, champ signalé
    await expect(page).toHaveURL(/erreur=KYC_INVALIDE&champ=payoutAccount$/);
    await page
      .getByRole("combobox", { name: "Recevoir l'argent des ventes sur" })
      .selectOption("moov");
    // Rien de ce qui a été tapé ne revient dans l'adresse (données personnelles) : tout est ressaisi
    await page.getByLabel("Nom tel qu'il est écrit sur la pièce").fill("Fatou Vendeuse");
    await page.getByLabel("Titulaire du compte").fill("Fatou Vendeuse");
    await page.getByLabel("Numéro de la pièce").fill("GA 1234 5678");
    await page.getByLabel("Numéro du compte").fill("066 76 54 32");
    await page.getByRole("button", { name: "Enregistrer le dossier" }).click();
    await expect(page).toHaveURL(/\?ok=kyc-enregistre$/);
    await expect(page.getByText("À compléter")).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer à l'équipe Kemdia" })).toBeDisabled();

    const photo = await phonePhoto();
    for (const [index, label] of ["recto", "verso"].entries()) {
      await page
        .getByLabel(new RegExp(`Prendre ou choisir la photo : Pièce d'identité — ${label}`))
        .setInputFiles({ name: `${label}.jpg`, mimeType: "image/jpeg", buffer: photo });
      // L'adresse ne change pas à la 2e photo : on attend la photo marquée « reçue »
      await expect(page.getByText("— reçue")).toHaveCount(index + 1);
    }
    await expectAccessible(page);
    await page.getByRole("button", { name: "Envoyer à l'équipe Kemdia" }).click();
    await expect(page).toHaveURL(/\?ok=kyc-envoye$/);
    await expect(page.getByText("En cours de vérification")).toBeVisible();
    // Envoyé : plus de formulaire
    await expect(page.getByLabel("Numéro de la pièce")).toHaveCount(0);
  });
});
