import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OTP_CODE_PATTERN, RECOVERY_CODE_PATTERN } from "@kemdia/contracts";
import {
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_PATTERN as DOMAIN_RECOVERY,
  generateRecoveryCode,
} from "../src/modules/identity/domain/second-factor.js";
import { TOTP_CODE_PATTERN } from "../src/modules/identity/domain/totp.js";

/** Double authentification (S6-T03) : mêmes formats dans le contrat (site), le domaine et la migration SQL. */
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20261016100000_double_authentification/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Double authentification : mêmes règles partout (S6-T03)", () => {
  it("formats des codes : contrat = domaine", () => {
    expect(DOMAIN_RECOVERY.source).toBe(RECOVERY_CODE_PATTERN.source);
    expect(TOTP_CODE_PATTERN.source).toBe(OTP_CODE_PATTERN.source);
    expect(generateRecoveryCode()).toMatch(RECOVERY_CODE_PATTERN);
    expect(RECOVERY_CODE_COUNT).toBe(10);
  });

  it("taille du secret chiffré : domaine = migration (1 + 12 + 16 + 20 octets)", () => {
    expect(migration).toContain(`octet_length("secret_box") = ${1 + 12 + 16 + 20}`);
  });
});
