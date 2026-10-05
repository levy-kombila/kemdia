import { expect, test } from "@playwright/test";

/** Parcours complet d'un client : recherche → fiche produit → panier → commande → confirmation. */
test("un client trouve un produit, le commande et le paie par Airtel Money", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  const search = isMobile ? page.locator("#site-search-mobile") : page.locator("#site-search");
  await search.fill("écouteurs");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/recherche\?q=/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("écouteurs");

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

  await page.goto("/panier");
  await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
  await page.getByRole("link", { name: "Commander" }).first().click();

  await expect(page).toHaveURL(/\/commande$/);
  await page.getByLabel("Prénom et nom").fill("Marie Nze");
  await page.getByLabel("Téléphone", { exact: true }).fill("077 12 34 56");
  await page.getByRole("combobox", { name: "Ville" }).selectOption("libreville");
  await page.getByRole("combobox", { name: "Quartier" }).selectOption("Glass");
  await page.getByLabel("Point de repère").fill("Portail bleu face à la pharmacie");
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByText(/Livraison à domicile, Libreville/)).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByLabel("Numéro Airtel Money")).toHaveValue("077 12 34 56");
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByRole("button", { name: /Commander et payer/ }).click();
  await expect(page.getByRole("heading", { name: "Validez sur votre téléphone" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Merci Marie, votre commande est confirmée/ }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/KMD-DEMO-[0-9A-F]{8}/)).toBeVisible();

  // Le panier est vidé après la commande
  await page.goto("/panier");
  await expect(page.getByRole("heading", { name: "Votre panier est vide" })).toBeVisible();
});
