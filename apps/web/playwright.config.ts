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
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    {
      name: "ordinateur",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
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
        env: { SITE_URL: "https://kemdia.example", APP_ENV: "e2e" },
      },
});
