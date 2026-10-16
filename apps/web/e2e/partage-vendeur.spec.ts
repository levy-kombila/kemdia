import { expect, test } from "@playwright/test";

test("fiche produit : aperçu WhatsApp complet et bouton de partage", async ({ page, request }) => {
  await page.goto("/promotions");
  await page.locator("article h3 a").first().click();
  await expect(page).toHaveURL(/\/produit\//);

  const og = (p: string) => page.locator(`meta[property="og:${p}"]`).getAttribute("content");
  expect(await og("url")).toMatch(/^https:\/\/kemdia\.example\/produit\//);
  expect(await og("title")).toMatch(/FCFA/);
  const image = (await og("image"))!;
  expect(image).toMatch(/^https:\/\/kemdia\.example\/produit\/.+\/opengraph-image/);

  // L'image d'aperçu existe bien (même chemin, servi par le site testé)
  const res = await request.get(new URL(image).pathname + new URL(image).search);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");

  const wa = page.getByRole("link", { name: "Partager sur WhatsApp" });
  const href = (await wa.getAttribute("href"))!;
  expect(href.startsWith("https://wa.me/?text=")).toBe(true);
  expect(decodeURIComponent(href)).toContain("utm_source=whatsapp");
  await expect(wa).toHaveAttribute("rel", /noopener/);
});

test("page Devenir vendeur : présentation, puis l'espace vendeur (connexion demandée)", async ({
  page,
}) => {
  await page.goto("/");
  await page.goto("/vendre");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Vendez partout au Gabon avec Kemdia",
  );
  // Aucun taux de commission annoncé tant que le client n'a pas tranché (question ouverte n° 3)
  await expect(page.getByText(/\d+ ?% à \d+ ?%/)).toHaveCount(0);
  await page.getByRole("link", { name: "Devenir vendeur" }).first().click();
  await expect(page).toHaveURL(/\/connexion\?retour=%2Fvendeur$/);
});
