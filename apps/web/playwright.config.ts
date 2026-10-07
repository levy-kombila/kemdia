import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout (S2-T07) : un vrai navigateur parcourt le site construit en production.
 * Le profil principal est un téléphone (la majorité des clients au Gabon achète sur mobile).
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: "fr-FR",
    timezoneId: "Africa/Libreville",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /performance\.spec\.ts/ },
    {
      name: "ordinateur",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
      testIgnore: /performance\.spec\.ts/,
    },
    // Budget de performance : téléphone en 3G, cache vide (voir e2e/performance.spec.ts)
    {
      name: "performance",
      use: { ...devices["Pixel 7"] },
      testMatch: /performance\.spec\.ts/,
      fullyParallel: false,
      retries: 1,
    },
  ],
  // Le site doit avoir été construit avant (pnpm build) ; on le démarre comme en production.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next start -p ${PORT}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          SITE_URL: "https://kemdia.example",
          APP_ENV: "e2e",
          // Le site lit toujours l'API (S3-T08) : en CI, celle du job ; sur le poste, celle de `pnpm dev`
          // (même clé que apps/api/.env, voir README). Sans elles, le serveur refuse de démarrer.
          API_URL: process.env.E2E_API_URL ?? "http://localhost:4000",
          API_INTERNAL_KEY: process.env.E2E_API_KEY ?? process.env.API_INTERNAL_KEY ?? "",
        },
      },
});
