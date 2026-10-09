import { describe, expect, it } from "vitest";
import { checkMutationOrigin } from "./origin";

const h = (headers: Record<string, string>) => new Headers(headers);
const SITE = { host: "kemdia-1.onrender.com" };

describe("contrôle d'origine (CSRF, HIGH-16)", () => {
  it("lectures (GET, HEAD, OPTIONS) : toujours permises", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
      expect(checkMutationOrigin(method, h({ origin: "https://pirate.example" })).ok).toBe(true);
    }
  });

  it("action du site lui-même : permise", () => {
    expect(
      checkMutationOrigin(
        "POST",
        h({ ...SITE, origin: "https://kemdia-1.onrender.com", "sec-fetch-site": "same-origin" }),
      ),
    ).toEqual({ ok: true });
    // Derrière un relais qui transmet l'hôte public
    expect(
      checkMutationOrigin(
        "POST",
        h({
          host: "10.0.0.5:3000",
          "x-forwarded-host": "kemdia-1.onrender.com",
          origin: "https://KEMDIA-1.onrender.com",
        }),
      ).ok,
    ).toBe(true);
  });

  it("sans Origin (que Next.js laisserait passer) ou Origin « null » : refusée", () => {
    expect(checkMutationOrigin("POST", h(SITE))).toEqual({ ok: false, reason: "origine-absente" });
    expect(checkMutationOrigin("POST", h({ ...SITE, origin: "null" }))).toMatchObject({
      ok: false,
    });
  });

  it("autre site, sous-domaine, autre port ou adresse illisible : refusée", () => {
    for (const origin of [
      "https://pirate.example",
      "https://evil.kemdia-1.onrender.com",
      "https://kemdia-1.onrender.com:8443",
      "pas une adresse",
    ]) {
      expect(checkMutationOrigin("POST", h({ ...SITE, origin }))).toMatchObject({ ok: false });
    }
  });

  it("le navigateur signale une requête venue d'ailleurs (Sec-Fetch-Site) : refusée même avec la bonne origine", () => {
    for (const site of ["cross-site", "same-site", "none"]) {
      expect(
        checkMutationOrigin(
          "DELETE",
          h({ ...SITE, origin: "https://kemdia-1.onrender.com", "sec-fetch-site": site }),
        ),
      ).toEqual({ ok: false, reason: "site-etranger" });
    }
  });
});
