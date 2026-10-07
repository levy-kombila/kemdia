import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "./argon2-password-hasher.js";

describe("Argon2PasswordHasher", () => {
  const hasher = new Argon2PasswordHasher();

  it("Argon2id, réglages OWASP, sel différent à chaque fois", async () => {
    const a = await hasher.hash("Mangue2026");
    const b = await hasher.hash("Mangue2026");
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("Mangue2026");
  });

  it("vérifie le bon mot de passe, refuse les autres", async () => {
    const h = await hasher.hash("Mangue2026");
    await expect(hasher.verify(h, "Mangue2026")).resolves.toBe(true);
    await expect(hasher.verify(h, "mangue2026")).resolves.toBe(false);
  });

  it("hachage abîmé : refus sans exception", async () => {
    await expect(hasher.verify("pas-un-hachage", "Mangue2026")).resolves.toBe(false);
  });
});
