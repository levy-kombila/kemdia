import { describe, expect, it } from "vitest";
import * as contract from "@kemdia/contracts/constants";
import { ADMIN_ASSIGNABLE_ROLES, ROLE_IMPLIES, ROLES, STAFF_ROLES } from "../domain/role.js";

/** Le domaine (sans dépendance) et le contrat (lu par le site) décrivent les mêmes rôles (S7.5-T04). */
describe("rôles : domaine et contrat", () => {
  it("mêmes rôles, même équipe, mêmes rôles attribuables, même hiérarchie", () => {
    expect(ROLES).toEqual(contract.ROLES);
    expect(STAFF_ROLES).toEqual(contract.STAFF_ROLES);
    expect(ADMIN_ASSIGNABLE_ROLES).toEqual(contract.ADMIN_ASSIGNABLE_ROLES);
    expect(ROLE_IMPLIES).toEqual(contract.ROLE_IMPLIES);
  });
});
