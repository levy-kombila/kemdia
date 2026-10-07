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
