import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("en-têtes de sécurité présents sur chaque page", async ({ request }) => {
  for (const path of ["/", "/panier", "/commande"]) {
    const res = await request.get(path);
    const h = res.headers();
    expect(h["content-security-policy"], path).toContain("default-src 'self'");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
});

test("CSP à nonce : chaque page a son nonce, tous ses scripts le portent, aucun script inline permis", async ({
  request,
}) => {
  const nonces = new Set<string>();
  const paths = [
    "/",
    "/compte",
    "/connexion",
    "/produit/ecouteurs-sans-fil-pro-beats-noir",
    "/page-qui-n-existe-pas",
  ];
  for (const path of paths) {
    const res = await request.get(path);
    const csp = res.headers()["content-security-policy"] ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, path).toBeTruthy();
    expect(csp, path).toContain("'strict-dynamic'");
    expect(
      csp.split("; ").find((d) => d.startsWith("script-src")),
      path,
    ).not.toContain("'unsafe-inline'");
    nonces.add(nonce!);
    // Blocs de données (JSON-LD) : jamais exécutés, la CSP ne les concerne pas
    const scripts = ((await res.text()).match(/<script\b[^>]*>/g) ?? []).filter(
      (tag) => !tag.includes('type="application/ld+json"'),
    );
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, path).toContain(`nonce="${nonce}"`);
  }
  expect(nonces.size).toBe(paths.length);
});

test("CSRF : une action envoyée depuis un autre site, ou sans origine, est refusée (403)", async ({
  request,
  baseURL,
}) => {
  for (const [path, origin] of [
    ["/connexion", "https://pirate.example"],
    ["/connexion", undefined],
    // Next.js exécute une action sur n'importe quelle adresse : images et fichiers aussi (relecture S4-T07)
    ["/favicon.ico", undefined],
    ["/images/inexistante.png", undefined],
  ] as const) {
    const res = await request.post(path, {
      headers: { "next-action": "0".repeat(42), ...(origin ? { origin } : {}) },
      data: "[]",
    });
    expect(res.status(), `${path} ${origin ?? "sans origine"}`).toBe(403);
  }
  // La même requête venue du site atteint Next.js (action inconnue : pas un 403)
  const own = await request.post("/connexion", {
    headers: { "next-action": "0".repeat(42), origin: baseURL! },
    data: "[]",
  });
  expect(own.status()).not.toBe(403);
});

test("une recherche contenant du code n'est jamais exécutée (pas de XSS réfléchie)", async ({
  page,
}) => {
  let dialog = false;
  page.on("dialog", async (d) => {
    dialog = true;
    await d.dismiss();
  });
  await page.goto(`/recherche?q=${encodeURIComponent('<img src=x onerror="alert(1)">')}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("<img src=x");
  expect(dialog).toBe(false);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test("un filtre inventé dans l'adresse est ignoré sans erreur", async ({ page }) => {
  const res = await page.goto("/categorie/high-tech?prix=0-999999999&marque=%3Cscript%3E&tri=DROP");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("list", { name: "Filtres actifs" })).toHaveCount(0);
});

// Accessibilité : aucune erreur grave (WCAG 2.1 A/AA) sur les pages clés du parcours d'achat
for (const path of [
  "/",
  "/categorie/high-tech",
  "/produit/apple-google-pixel-modern-blanc",
  "/panier",
  "/commande",
  "/connexion",
  "/vendre",
]) {
  test(`accessibilité ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious.map((v) => `${v.id} (${v.nodes.length}) : ${v.help}`)).toEqual([]);
  });
}
