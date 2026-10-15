import { expect, test, type Page } from "@playwright/test";
import { MAILPIT_URL, lastCode } from "./mailpit";

/**
 * Premier achat de bout en bout (S5-T07, ADR-0029) : le site est branché sur la vraie API.
 * - Visiteur : la commande demande un compte (retour à la connexion, puis au tunnel).
 * - Compte neuf (code reçu dans Mailpit) : recherche → panier → commande → paiement Mobile Money validé sur le
 *   téléphone simulé → commande confirmée, facture téléchargeable ; puis paiement à la livraison et annulation.
 * Chaque parcours crée son propre compte : la limite de 3 commandes ouvertes par compte ne gêne aucun autre test.
 */
const SANDBOX = !!process.env.E2E_SANDBOX;
/** 70 000 FCFA dans le catalogue de démonstration (packages/contracts/src/demo) */
const COD_PRODUCT = "musculation-elite-generic-blanc";
const PASSWORD = "Mangue2026";
const unique = () => `achat.${Date.now()}.${Math.floor(Math.random() * 1e6)}@exemple.ga`;
/**
 * Numéro Airtel (07…) tiré au hasard : l'API limite les demandes de paiement vers un même numéro (5 par heure, tous
 * comptes confondus) ; les tests ne doivent pas se gêner entre eux ni d'un lancement à l'autre.
 */
const randomAirtel = () => {
  const d = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  return `07${d.slice(0, 1)} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)}`;
};

async function addFirstProduct(page: Page, isMobile: boolean, query = "écouteurs") {
  await page.goto("/");
  const search = isMobile ? page.locator("#site-search-mobile") : page.locator("#site-search");
  await search.fill(query);
  await search.press("Enter");
  await expect(page).toHaveURL(/\/recherche\?q=/);
  // Premier produit en stock de la liste
  await page
    .locator("article", {
      has: page
        .getByRole("button", { name: /Ajouter .* au panier/ })
        .filter({ hasNot: page.locator("[disabled]") }),
    })
    .first()
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/\/produit\//);
  const title = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  // Mobile : barre d'achat collée en bas ; ordinateur : encadré d'achat
  await page.getByRole("button", { name: "Ajouter au panier" }).last().click();
  await expect(page.getByText(/ajouté au panier/).first()).toBeVisible();
  return title;
}

async function signUp(page: Page): Promise<string> {
  const email = unique();
  await page.getByRole("link", { name: "Créer un compte" }).first().click();
  await page.getByLabel("Prénom").fill("Marie");
  await page.getByLabel("Nom", { exact: true }).fill("Nze");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Saisissez le code reçu")).toBeVisible();
  await page.getByLabel("Chiffre 1").click();
  await page.keyboard.insertText(await lastCode(email, "Votre code de vérification Kemdia"));
  await page.getByRole("button", { name: "Vérifier" }).click();
  await expect(page.getByText("Bienvenue chez Kemdia, Marie !")).toBeVisible();
  return email;
}

async function fillCheckout(page: Page, phone = randomAirtel()) {
  await expect(page).toHaveURL(/\/commande$/);
  // Nom repris du compte
  await expect(page.getByLabel("Prénom et nom")).toHaveValue("Marie Nze");
  await page.getByLabel("Téléphone", { exact: true }).fill(phone);
  await page.getByRole("combobox", { name: "Ville" }).selectOption("libreville");
  await page.getByRole("combobox", { name: "Quartier" }).selectOption("Glass");
  await page.getByLabel("Point de repère").fill("Portail bleu face à la pharmacie");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText(/Livraison à domicile, Libreville/)).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
}

test("visiteur : la commande demande un compte, puis ramène au tunnel", async ({
  page,
  isMobile,
}) => {
  await addFirstProduct(page, isMobile);
  await page.goto("/panier");
  await page.getByRole("link", { name: "Commander" }).first().click();
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fcommande$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.describe("premier achat avec un compte neuf", () => {
  test.skip(!MAILPIT_URL, "boîte de test Mailpit absente (E2E_MAILPIT_URL non défini)");

  test("Airtel Money validé sur le téléphone simulé → confirmée, facture en PDF, panier vidé", async ({
    page,
    isMobile,
  }) => {
    test.skip(!SANDBOX, "opérateur simulé absent (E2E_SANDBOX non défini)");
    test.setTimeout(90_000);
    const title = await addFirstProduct(page, isMobile);
    await page.goto("/panier");
    await page.getByRole("link", { name: "Commander" }).first().click();
    await expect(page).toHaveURL(/\/connexion/);
    await signUp(page);
    // Après l'inscription : retour au tunnel, le panier du navigateur a rejoint le compte
    await page.goto("/commande");
    const phone = randomAirtel();
    await fillCheckout(page, phone);
    // Numéro de paiement proposé depuis l'adresse, opérateur Airtel déduit du 07
    await expect(page.getByLabel("Numéro Airtel Money")).toHaveValue(phone);
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: /Commander et payer/ }).click();

    // Page de la commande : attente de la validation sur le téléphone
    await expect(page).toHaveURL(/\/compte\/commandes\/KMD-[A-Z0-9]{6}\?nouvelle=1$/);
    const reference = /KMD-[A-Z0-9]{6}/.exec(page.url())![0];
    await expect(page.getByRole("heading", { name: "Validez sur votre téléphone" })).toBeVisible();
    await expect(page.getByText(title).first()).toBeVisible();

    // Téléphone simulé, dans un autre onglet du même navigateur (même compte)
    const simulated = await page.context().newPage();
    await simulated.goto("/demo/telephone");
    await expect(simulated.getByText(reference)).toBeVisible();
    await simulated.getByLabel(/Code PIN/).fill("1234");
    await simulated.getByRole("button", { name: /Valider/ }).click();
    await expect(simulated.getByText(/Paiement validé/)).toBeVisible();
    await simulated.close();

    // La page de la commande se met à jour toute seule : payée, facture prête
    await expect(page.getByText("Confirmée").first()).toBeVisible({ timeout: 20_000 });
    const invoice = page.getByRole("link", { name: /Facture KMD-F-\d{4}-\d{6}/ });
    await expect(invoice).toBeVisible({ timeout: 20_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), invoice.click()]);
    expect(download.suggestedFilename()).toMatch(/^KMD-F-\d{4}-\d{6}\.pdf$/);

    // « Mes commandes » la montre ; le panier est vide
    await page.goto("/compte/commandes");
    await expect(page.getByRole("link", { name: new RegExp(reference) })).toBeVisible();
    await page.goto("/panier");
    await expect(page.getByRole("heading", { name: "Votre panier est vide" })).toBeVisible();
  });

  test("code promo DEMO10, paiement à la livraison, puis annulation depuis « Mes commandes »", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/connexion?retour=/");
    await signUp(page);
    // Produit du catalogue de démonstration sous le plafond provisoire du paiement à la livraison (100 000 FCFA)
    await page.goto(`/produit/${COD_PRODUCT}`);
    await page.getByRole("button", { name: "Ajouter au panier" }).last().click();
    await expect(page.getByText(/ajouté au panier/).first()).toBeVisible();
    await page.goto("/commande");
    await fillCheckout(page);
    await page.getByRole("radio", { name: /Paiement à la livraison/ }).check();
    await page.getByRole("button", { name: "Continuer" }).click();
    // Code promo de démonstration (S5-T08) : −10 % sur 70 000 FCFA
    await page.getByLabel("Code promo").fill("demo10");
    await page.getByRole("button", { name: "Appliquer" }).click();
    await expect(page.getByText(/Code DEMO10 appliqué/)).toBeVisible();
    await page.getByRole("button", { name: /Confirmer la commande · 63\s000/ }).click();

    await expect(page).toHaveURL(/\/compte\/commandes\/KMD-[A-Z0-9]{6}\?nouvelle=1$/);
    await expect(page.getByText(/votre commande est confirmée/)).toBeVisible();
    await expect(page.getByText("À régler au livreur, à la réception")).toBeVisible();

    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await page.getByRole("button", { name: "Oui, annuler la commande" }).click();
    await expect(page.getByText(/Commande annulée/).first()).toBeVisible();
    await expect(page.getByText("Annulée").first()).toBeVisible();
  });
});

test("démonstration : bandeau sur chaque page, mode d'emploi du premier achat", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Tester un achat" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tester un achat" })).toBeVisible();
  await expect(page.getByText("DEMO10").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "téléphone simulé" })).toHaveAttribute(
    "href",
    "/demo/telephone",
  );
});
