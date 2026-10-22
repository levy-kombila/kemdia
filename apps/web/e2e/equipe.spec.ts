import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { totp } from "./totp";

/**
 * Espace de l'équipe (S6-T05, ADR-0036), branché sur la vraie API : activation de la double authentification (QR code
 * dessiné par le serveur, premier code, codes de secours), tableau de bord, modération avec photos, boutiques, puis
 * confirmation d'une nouvelle session par un code de secours.
 *
 * Données insérées par la CI dans sa base éphémère (e2e/fixtures/equipe-e2e.sql) ; sans elles, ces tests sont sautés.
 * Le parcours complet change l'état de la base (2FA activée, décisions) : il ne tourne que sur le profil « mobile »
 * (l'équipe doit pouvoir travailler depuis un téléphone), en série.
 */
const STAFF = { email: "equipe-e2e@kemdia.test", password: "E2e-Kemdia-2026" };
const CLIENT = { email: "e2e@kemdia.test", password: "E2e-Kemdia-2026" };
const withData = !!process.env.E2E_ACCOUNT;

async function login(page: Page, account: { email: string; password: string }, returnTo: string) {
  await page.goto(`/connexion?retour=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Adresse e-mail").fill(account.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function expectAccessible(page: Page) {
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual(
    [],
  );
}

test.describe("espace de l'équipe : accès", () => {
  test("sans connexion : la page de connexion, puis retour à l'espace demandé", async ({
    page,
  }) => {
    await page.goto("/equipe/moderation");
    await expect(page).toHaveURL(/\/connexion\?retour=%2Fequipe%2Fmoderation$/);
  });

  test("un client n'y voit rien (404), même pas l'existence de l'espace", async ({ page }) => {
    test.skip(!withData, "données de test absentes (E2E_ACCOUNT non défini)");
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/equipe");
    await login(page, CLIENT, "/equipe");
    expect((await response).status()).toBe(404);
    await expect(page.getByRole("link", { name: /espace de l'équipe/ })).toHaveCount(0);
  });

  test("photo à modérer sans session : introuvable (404), jamais en cache", async ({ request }) => {
    const response = await request.get(
      "/equipe/moderation/0e2e0000-0000-4000-8000-0000000000b3/photos/0e2e0000-0000-4000-8000-0000000000c3",
    );
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  });
});

test.describe("espace de l'équipe : parcours complet", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!withData, "données de test absentes (E2E_ACCOUNT non défini)");
  test.skip(({ isMobile }) => !isMobile, "parcours avec état : profil mobile seulement");

  let recoveryCodes: string[] = [];

  test("activer la double authentification : mot de passe, QR code, premier code, codes de secours", async ({
    page,
  }) => {
    await login(page, STAFF, "/equipe");
    // 2FA pas encore activée : la page « Sécurité » s'ouvre d'elle-même
    await expect(page).toHaveURL(/\/equipe\/securite$/);
    await expect(page.getByRole("heading", { name: "Sécurité", level: 1 })).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Mot de passe", { exact: true }).fill(STAFF.password);
    await page.getByRole("button", { name: "Afficher le QR code" }).click();
    const qr = page.getByRole("img", { name: "QR code de la double authentification" });
    await expect(qr).toBeVisible();
    // Dessiné sur le serveur : un simple tracé, pas d'image externe ni de script
    expect(await qr.locator("path").getAttribute("d")).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
    const link = page.getByRole("link", { name: "Ouvrir dans l'application" });
    await expect(link).toHaveAttribute("href", /^otpauth:\/\/totp\//);
    const secret = (await page.locator("p.font-mono").textContent())!.replace(/\s/g, "");
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    await page.getByLabel("Code à 6 chiffres affiché par l'application").fill(totp(secret));
    await page.getByRole("button", { name: "Activer la double authentification" }).click();

    const codes = page.getByRole("list", { name: "Codes de secours" }).getByRole("listitem");
    await expect(codes).toHaveCount(10);
    recoveryCodes = (await codes.allTextContents()).map((c) => c.trim());
    expect(recoveryCodes.every((c) => /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(c))).toBe(true);
    await expectAccessible(page);

    // Le bouton suivant n'est actif qu'après avoir confirmé que les codes sont rangés
    await expect(page.getByRole("link", { name: "Aller au tableau de bord" })).toHaveCount(0);
    await page.getByLabel("J'ai rangé mes codes de secours en lieu sûr.").check();
    await page.getByRole("link", { name: "Aller au tableau de bord" }).click();
    await expect(page).toHaveURL(/\/equipe$/);
    await expect(page.getByRole("heading", { name: "Bonjour Ines", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /produits à modérer/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /demandes de boutique/ })).toBeVisible();
    await expectAccessible(page);

    // --- Modération : produit avec photo → validé ---
    await page.getByRole("link", { name: /produits à modérer/ }).click();
    await expect(page).toHaveURL(/\/equipe\/moderation$/);
    await page.getByRole("link", { name: /Sac en raphia modération E2E/ }).click();
    await expect(page.getByRole("heading", { name: "Sac en raphia modération E2E" })).toBeVisible();
    const photo = page.getByRole("img", { name: "Photo 1 (principale)" });
    await expect(photo).toHaveAttribute(
      "src",
      "/equipe/moderation/0e2e0000-0000-4000-8000-0000000000b3/photos/0e2e0000-0000-4000-8000-0000000000c3",
    );
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBe(800);
    await expectAccessible(page);
    // Avant la décision, la photo n'est pas publique (produit pas encore validé)
    expect(
      (await page.request.get("/images/v/0e2e0000-0000-4000-8000-0000000000c3.webp")).status(),
    ).toBe(404);

    await page.getByRole("button", { name: "Valider et mettre en ligne" }).click();
    await expect(page).toHaveURL(/\/equipe\/moderation\?ok=produit-valide$/);
    await expect(page.getByRole("status")).toContainText("Produit validé");
    await expect(page.getByRole("link", { name: /Sac en raphia modération E2E/ })).toHaveCount(0);

    // --- Modération : produit sans photo → refusé, avec un motif ---
    await page.getByRole("link", { name: /Bracelet à refuser E2E/ }).click();
    await page.getByText("Refuser le produit…").click();
    await page.getByLabel("Motif du refus").fill("Description trop courte : précisez la matière.");
    await page.getByRole("button", { name: "Refuser le produit", exact: true }).click();
    await expect(page).toHaveURL(/\/equipe\/moderation\?ok=produit-refuse$/);

    // --- Boutiques : demande validée ---
    await page
      .getByRole("navigation", { name: "Espace de l'équipe" })
      .getByRole("link", { name: "Boutiques" })
      .click();
    await page.getByRole("link", { name: /Boutique en attente E2E/ }).click();
    await expect(
      page.getByRole("heading", { name: "Boutique en attente E2E", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Port-Gentil" })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Valider la boutique" }).click();
    await expect(page).toHaveURL(/\?ok=boutique-validee$/);
    await expect(page.getByRole("status")).toContainText("Boutique validée");
    // Une boutique active ne se valide pas deux fois : seule la suspension reste proposée
    await expect(page.getByRole("button", { name: "Valider la boutique" })).toHaveCount(0);
    await expect(page.getByText("Suspendre la boutique…")).toBeVisible();

    // Le produit validé est en ligne, avec sa photo publique
    await page.goto("/produit/sac-raphia-moderation-e2e");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sac en raphia modération E2E",
    );
  });

  test("nouvelle session : le code est redemandé ; un code de secours la confirme", async ({
    page,
  }) => {
    expect(recoveryCodes).toHaveLength(10);
    await login(page, STAFF, "/equipe/moderation");
    await expect(page).toHaveURL(/\/equipe\/confirmer\?retour=%2Fequipe%2Fmoderation$/);
    await expectAccessible(page);

    await page.getByRole("button", { name: /Utiliser un code de secours/ }).click();
    await page.getByLabel("Code de secours").fill("aaaa-bbbb-cccc");
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Code incorrect" })).toBeVisible();

    await page.getByLabel("Code de secours").fill(recoveryCodes[0]!);
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page).toHaveURL(/\/equipe\/moderation$/);

    // Page « Sécurité » : 9 codes de secours restants
    await page.goto("/equipe/securite");
    await expect(page.getByText("Codes de secours encore utilisables")).toContainText("9");

    // --- Livraisons (S7-T02) : remise au transporteur, échec, nouvelle tentative, livrée ---
    await page.goto("/equipe");
    await expect(
      page.getByRole("link", { name: /commandes à remettre au transporteur/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: /commandes à remettre au transporteur/ }).click();
    await expect(page).toHaveURL(/\/equipe\/livraisons$/);
    await expectAccessible(page);
    const ready = page.getByRole("listitem").filter({ hasText: "KMD-E2ELVR" });
    await expect(ready).toContainText("Libreville");
    // Ni le nom ni le téléphone du client dans la liste
    await expect(ready).not.toContainText("Lea");
    await ready.getByRole("button", { name: "Remettre au transporteur" }).click();
    await expect(page).toHaveURL(/\/equipe\/livraisons\?ok=livraison-remise$/);
    await expect(page.getByRole("status")).toContainText("remise au transporteur");

    await page.getByRole("link", { name: "En route", exact: true }).click();
    await page.getByRole("link", { name: /KMD-E2ELVR/ }).click();
    await expect(
      page.getByRole("heading", { name: "Livraison KMD-E2ELVR", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/Kemdia 150\s?FCFA · transporteur 850\s?FCFA/)).toBeVisible();
    await expectAccessible(page);
    await page.getByText("Noter un échec de livraison…").click();
    await page.getByLabel("Pourquoi la livraison n'a pas pu se faire ?").fill("Portail fermé");
    await page.getByRole("button", { name: "Noter un échec de livraison", exact: true }).click();
    await expect(page).toHaveURL(/\?ok=livraison-echec$/);
    await page.getByRole("button", { name: "Nouvelle tentative de livraison" }).click();
    await expect(page).toHaveURL(/\?ok=livraison-relancee$/);
    await page.getByRole("button", { name: "Noter la commande livrée" }).click();
    await expect(page).toHaveURL(/\?ok=livraison-livree$/);
    await expect(page.getByText("Livrée", { exact: true }).first()).toBeVisible();
    // Livrée : plus aucune étape proposée
    await expect(page.getByRole("button", { name: "Noter la commande livrée" })).toHaveCount(0);

    // Barème : lisible et accessible (pas modifié : la base de la CI sert aux autres parcours)
    await page.goto("/equipe/livraisons/bareme");
    await expect(
      page.getByRole("heading", { name: "Barème de livraison", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "Libreville / Grand Libreville" })).toBeVisible();
    await expectAccessible(page);

    // --- Utilisateurs (S7.5-T04) : un administrateur n'est jamais modifiable ici ---
    await page.goto("/equipe/utilisateurs");
    await expect(page.getByRole("heading", { name: "Utilisateurs", level: 1 })).toBeVisible();
    await expect(
      page.getByText("Administrateur : géré depuis le serveur seulement."),
    ).toBeVisible();
    await expectAccessible(page);
    // Recherche d'un client, rôle accordé puis retiré (la base revient comme avant)
    await page.getByLabel("Compte à ajouter à l'équipe").fill(CLIENT.email);
    await page.getByRole("button", { name: "Rechercher" }).click();
    await page
      .getByRole("region", { name: "Compte trouvé" })
      .getByRole("button", { name: "Service client", pressed: false })
      .click();
    await expect(page).toHaveURL(/\/equipe\/utilisateurs\?ok=role-accorde$/);
    // Par son nom : l'adresse « e2e@kemdia.test » est aussi contenue dans celle de l'équipe
    const member = page.getByRole("listitem").filter({ hasText: "Awa Testeuse" });
    await expect(member).toContainText("Double authentification à activer");
    await member.getByRole("button", { name: "Service client", pressed: true }).click();
    await expect(page).toHaveURL(/\/equipe\/utilisateurs\?ok=role-retire$/);

    // --- Service client : recherche, puis commandes en lecture seule ---
    await page.goto("/equipe/clients");
    await page.getByLabel("Client à retrouver").fill(CLIENT.email);
    await page.getByRole("button", { name: "Rechercher" }).click();
    await page.getByRole("link", { name: /voir ses commandes/ }).click();
    await expect(
      page.getByRole("heading", { name: "Commandes du client", level: 1 }),
    ).toBeVisible();
    await expectAccessible(page);
  });
});
