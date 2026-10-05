import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE, siteUrl } from "./site";

describe("siteUrl (adresse lue au démarrage)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("utilise SITE_URL si elle est valide (sans chemin ni barre finale)", () => {
    vi.stubEnv("SITE_URL", "https://kemdia.onrender.com/");
    expect(siteUrl()).toBe("https://kemdia.onrender.com");
  });

  it("ignore une valeur invalide ou dangereuse", () => {
    vi.stubEnv("SITE_URL", "javascript:alert(1)");
    expect(siteUrl()).toBe(SITE.url.replace(/\/+$/, ""));
    vi.stubEnv("SITE_URL", "pas une url");
    expect(siteUrl()).toBe(SITE.url.replace(/\/+$/, ""));
  });
});
