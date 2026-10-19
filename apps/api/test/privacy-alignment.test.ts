import { describe, expect, it } from "vitest";
import { ACCOUNT_RETENTION, AUDIT_ACTIONS, PRIVACY_ERROR_CODES } from "@kemdia/contracts/constants";
import { DELETION_BLOCKERS, INACTIVITY } from "../src/modules/privacy/domain/privacy.js";
import { PRIVACY_ERROR_STATUS } from "../src/modules/privacy/interface/privacy-http-errors.js";

/** Règles des données personnelles écrites dans le contrat (site) et le domaine de l'API (S7-T08). */
describe("Données personnelles : mêmes règles dans le contrat et le domaine (S7-T08)", () => {
  it("empêchements, statuts HTTP et durées de conservation", () => {
    expect([...DELETION_BLOCKERS]).toEqual([...PRIVACY_ERROR_CODES]);
    expect(Object.keys(PRIVACY_ERROR_STATUS).sort()).toEqual([...PRIVACY_ERROR_CODES].sort());
    expect(INACTIVITY.years).toBe(ACCOUNT_RETENTION.inactiveYears);
    expect(INACTIVITY.noticeDays).toBe(ACCOUNT_RETENTION.noticeDays);
  });

  it("actions du journal d'audit connues du contrat", () => {
    for (const action of [
      "account.data_exported",
      "account.deleted",
      "account.delete_failed",
      "account.delete_locked",
      "account.inactivity_notified",
    ]) {
      expect(AUDIT_ACTIONS).toContain(action);
    }
  });
});
