import { expect, test } from "@playwright/test";

test("les filtres réduisent la liste et restent dans l'adresse (partageable)", async ({
  page,
  isMobile,
}) => {
  await page.goto("/categorie/beaute-sante");
  const count = async () =>
    Number(
      (await page
        .locator("p", { hasText: /produits?$/ })
        .first()
        .locator("strong")
        .textContent()) ?? 0,
    );
  const before = await count();

  if (isMobile) await page.getByRole("button", { name: /Filtres/ }).click();
  await page
    .getByRole("link", { name: /En promotion/ })
    .first()
    .click();
  await expect(page).toHaveURL(/promo=1/);
  if (isMobile) await page.getByRole("button", { name: /Voir \d+ produit/ }).click();

  const after = await count();
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
  await expect(page.getByRole("list", { name: "Filtres actifs" })).toContainText("En promotion");

  // Le tri conserve les filtres
  await page.getByRole("combobox", { name: /Trier par/ }).selectOption("prix-asc");
  await expect(page).toHaveURL(/promo=1.*tri=prix-asc|tri=prix-asc.*promo=1/);

  await page.getByRole("link", { name: "Tout effacer" }).click();
  await expect(page).not.toHaveURL(/promo=1/);
});

test("une recherche sans résultat propose des alternatives", async ({ page }) => {
  await page.goto("/recherche?q=zzzzintrouvable");
  await expect(
    page.getByRole("heading", { name: /Aucun résultat pour « zzzzintrouvable »/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Les plus vendus en ce moment" })).toBeVisible();
});

test("favoris : le cœur ajoute le produit à la page Mes favoris", async ({ page }) => {
  await page.goto("/promotions");
  const heart = page.getByRole("button", { name: /Ajouter .* aux favoris/ }).first();
  const label = (await heart.getAttribute("aria-label"))!;
  const title = label.match(/« (.*) »/)![1]!;
  await heart.click();
  await expect(
    page.getByRole("button", { name: `Retirer « ${title} » des favoris` }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.goto("/favoris");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByRole("button", { name: `Retirer « ${title} » des favoris` }).click();
  await expect(page.getByRole("heading", { name: "Aucun favori pour le moment" })).toBeVisible();
});

test("accueil : les cartes du bas de page, rendues interactives à l'approche, fonctionnent (S3-T08)", async ({
  page,
}) => {
  await page.goto("/");
  const grid = page.locator('section[aria-labelledby="tous-produits"]');
  // Contenu présent dans le HTML dès le chargement (référencement), même avant d'être interactif
  await expect(grid.getByRole("article").first()).toBeAttached();
  await grid.scrollIntoViewIfNeeded();
  const heart = grid.getByRole("button", { name: /Ajouter .* aux favoris/ }).first();
  const title = (await heart.getAttribute("aria-label"))!.match(/« (.*) »/)![1]!;
  await heart.click();
  await expect(
    grid.getByRole("button", { name: `Retirer « ${title} » des favoris` }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("S7.5-T07 : annuaire des boutiques, page publique et lien depuis la fiche produit", async ({
  page,
}) => {
  await page.goto("/boutiques?ville=Libreville&quartier=Glass");
  await expect(
    page.getByRole("heading", { name: "Boutiques près de chez moi", level: 1 }),
  ).toBeVisible();
  // La boutique officielle reste en tête de l'annuaire
  const kemdia = page.getByRole("link", { name: /Kemdia.*Boutique officielle/ }).first();
  await expect(kemdia).toBeVisible();
  await kemdia.click();
  await expect(page).toHaveURL(/\/boutique\/kemdia$/);
  await expect(page.getByRole("heading", { name: /Kemdia/, level: 1 })).toBeVisible();
  await expect(page.getByText(/Vend sur Kemdia depuis/)).toBeVisible();
  // Ses produits, triables et paginés comme une catégorie ; jamais de téléphone
  await expect(page.locator("a[href^='/produit/']").first()).toBeVisible();
  await expect(page.locator("main header").first()).not.toContainText(/\+241|0[67]\d \d{2} \d{2}/);

  // Fiche produit : « Vendu par » mène à la page de la boutique
  await page.locator("a[href^='/produit/']").first().click();
  await page.locator("a[href='/boutique/kemdia']").first().click();
  await expect(page).toHaveURL(/\/boutique\/kemdia$/);

  // Boutique inconnue : page introuvable
  const missing = await page.goto("/boutique/boutique-qui-n-existe-pas");
  expect(missing?.status()).toBe(404);
});

test("S8-T01 : avis clients sur la fiche produit — réservés aux clients livrés", async ({
  page,
}) => {
  await page.goto("/boutique/kemdia");
  await page.locator("a[href^='/produit/']").first().click();
  await expect(page.getByRole("heading", { name: "Avis clients", level: 2 })).toBeVisible();
  // Visiteur : pas de formulaire, un lien pour se connecter
  await expect(
    page.getByText("Seuls les clients ayant reçu ce produit peuvent donner leur avis."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Publier mon avis" })).toHaveCount(0);
});

test("S8-T02 : « Signaler un problème » — bouton sur chaque page, compte connecté exigé", async ({
  page,
}) => {
  await page.goto("/boutiques");
  await page.getByRole("link", { name: "Signaler un problème" }).click();
  // Visiteur : connexion d'abord, puis retour au formulaire avec la page d'origine (chemin seulement)
  await expect(page).toHaveURL(
    /\/connexion\?retour=%2Fsignaler-un-probleme%3Fdepuis%3D%252Fboutiques$/,
  );
});
