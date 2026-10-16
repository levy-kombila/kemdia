import { expect, test } from "@playwright/test";

/**
 * Photos des vendeurs (S6-T04, ADR-0035) : relayées par le site sous « /images/v/… », jamais par l'optimiseur de
 * Next.js. Le produit et sa photo sont insérés par la CI dans sa base éphémère (e2e/fixtures/photos-vendeur-e2e.sql).
 */
const SLUG = "pagne-photo-vendeur-e2e";
const PHOTO = "/images/v/0e2e0000-0000-4000-8000-0000000000c1.webp";
const THUMBNAIL = "/images/v/0e2e0000-0000-4000-8000-0000000000c1-480.webp";

test("fiche produit : la photo du vendeur s'affiche, servie par le relais du site", async ({
  page,
}) => {
  await page.goto(`/produit/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pagne photo vendeur E2E");
  const main = page.getByRole("img", { name: "Pagne photo vendeur E2E" });
  await expect(main).toHaveAttribute("src", PHOTO);
  await expect
    .poll(() => main.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(800);
});

test("relais : WebP en cache court ; vignette ; photo inconnue ou adresse inventée → 404", async ({
  request,
}) => {
  const large = await request.get(PHOTO);
  expect(large.status()).toBe(200);
  expect(large.headers()["content-type"]).toBe("image/webp");
  expect(large.headers()["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=300");
  expect(large.headers()["x-content-type-options"]).toBe("nosniff");
  const etag = large.headers()["etag"]!;
  expect(etag).toMatch(/^"[0-9a-f]{32}-large"$/);
  expect((await request.get(PHOTO, { headers: { "if-none-match": etag } })).status()).toBe(304);

  const small = await request.get(THUMBNAIL);
  expect(small.status()).toBe(200);
  expect((await small.body()).subarray(8, 12).toString()).toBe("WEBP");

  for (const path of [
    "/images/v/0e2e0000-0000-4000-8000-0000000000ff.webp",
    "/images/v/pas-une-photo.webp",
    "/images/v/0e2e0000-0000-4000-8000-0000000000c1.png",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  // L'optimiseur de Next.js refuse les photos des vendeurs (elles ne doivent jamais rester 24 h en cache)
  const optimized = await request.get(`/_next/image?url=${encodeURIComponent(PHOTO)}&w=640&q=75`);
  expect(optimized.status()).toBe(400);
});
