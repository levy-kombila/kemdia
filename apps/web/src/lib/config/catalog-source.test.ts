import { describe, expect, it } from "vitest";
import { SiteConfigError, describeCatalogSource, resolveCatalogSource } from "./catalog-source";

const KEY = "k".repeat(40);

const problems = (env: Record<string, string | undefined>): readonly string[] => {
  try {
    resolveCatalogSource(env);
  } catch (error) {
    if (error instanceof SiteConfigError) return error.problems;
    throw error;
  }
  return [];
};

describe("Source du catalogue choisie au démarrage (S3-T05)", () => {
  it("cas 1 — API_URL définie : l'API uniquement", () => {
    expect(
      resolveCatalogSource({
        API_URL: "http://api:4000/",
        API_INTERNAL_KEY: KEY,
        APP_ENV: "production",
      }),
    ).toEqual({ kind: "api", url: "http://api:4000", key: KEY, timeoutMs: 5_000 });
  });

  it("cas 2 — API_URL absente : le fichier de démonstration (sauf en production)", () => {
    for (const APP_ENV of [undefined, "local", "e2e", "demo", "staging"]) {
      expect(resolveCatalogSource({ APP_ENV })).toEqual({ kind: "file" });
    }
    // Variable vide = absente
    expect(resolveCatalogSource({ API_URL: "  " })).toEqual({ kind: "file" });
  });

  it("cas 3 — APP_ENV=production sans API_URL : le site refuse de démarrer", () => {
    expect(() => resolveCatalogSource({ APP_ENV: "production" })).toThrow(SiteConfigError);
    expect(problems({ APP_ENV: "production" })).toEqual([
      "API_URL : obligatoire en production (le fichier de démonstration y est interdit)",
    ]);
  });

  it("la clé interne est obligatoire avec l'API, et inutile sans elle", () => {
    expect(problems({ API_URL: "http://api:4000" })).toEqual([
      expect.stringMatching(/^API_INTERNAL_KEY : obligatoire avec API_URL/),
    ]);
    expect(problems({ API_INTERNAL_KEY: KEY })).toEqual([
      expect.stringMatching(/^API_INTERNAL_KEY définie sans API_URL/),
    ]);
  });

  it("refuse une adresse ou une clé invalide, sans jamais recopier leur valeur", () => {
    const list = problems({
      API_URL: "ftp://utilisateur:motdepasse@api",
      API_INTERNAL_KEY: "courte-et-secrete",
      APP_ENV: "prod",
    });
    expect(list.join("\n")).toMatch(/^APP_ENV : /m);
    expect(list.join("\n")).toMatch(/^API_URL : /m);
    expect(list.join("\n")).toMatch(/^API_INTERNAL_KEY : /m);
    expect(list.join()).not.toMatch(/motdepasse|courte-et-secrete/);
    expect(problems({ API_URL: "https://user:pass@api.kemdia.ga", API_INTERNAL_KEY: KEY })).toEqual(
      [expect.stringMatching(/^API_URL : sans identifiants/)],
    );
  });

  it("délai de réponse borné", () => {
    expect(
      problems({ API_URL: "http://api", API_INTERNAL_KEY: KEY, CATALOG_TIMEOUT_MS: "10" }),
    ).toEqual([expect.stringMatching(/^CATALOG_TIMEOUT_MS : /)]);
  });

  it("description pour le journal de démarrage, sans la clé", () => {
    const text = describeCatalogSource(
      resolveCatalogSource({ API_URL: "http://api:4000", API_INTERNAL_KEY: KEY }),
    );
    expect(text).toBe("API http://api:4000 (délai 5000 ms)");
    expect(text).not.toContain(KEY);
    expect(describeCatalogSource({ kind: "file" })).toMatch(/fichier de démonstration/);
  });
});
