import { describe, expect, it } from "vitest";
import {
  LOGIN_LOCK_MS,
  LOGIN_WINDOW_MS,
  isLocked,
  nextGuardState,
  type LoginGuardState,
} from "./login-guard.js";

const T0 = new Date("2026-10-08T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Réserve n essais d'affilée. */
function claims(n: number, start: LoginGuardState | null = null, now = T0): LoginGuardState | null {
  let s = start;
  for (let i = 0; i < n; i++) s = nextGuardState(s, now);
  return s;
}

describe("BR-040 : 3 essais puis 15 minutes, par identifiant", () => {
  it("les 3 premiers essais passent, le 4ᵉ bloque 15 minutes", () => {
    expect(claims(3)).toEqual({ attempts: 3, lockedUntil: null, updatedAt: T0 });
    const fourth = claims(4)!;
    expect(isLocked(fourth, T0)).toBe(true);
    expect(fourth.lockedUntil).toEqual(at(LOGIN_LOCK_MS));
  });

  it("un essai pendant le blocage ne le prolonge pas", () => {
    const locked = claims(4)!;
    expect(nextGuardState(locked, at(60_000))).toMatchObject({
      attempts: locked.attempts,
      lockedUntil: locked.lockedUntil,
    });
  });

  it("après 15 minutes, on repart de zéro", () => {
    const locked = claims(4)!;
    const after = nextGuardState(locked, at(LOGIN_LOCK_MS));
    expect(after).toEqual({ attempts: 1, lockedUntil: null, updatedAt: at(LOGIN_LOCK_MS) });
    expect(isLocked(locked, at(LOGIN_LOCK_MS - 1))).toBe(true);
    expect(isLocked(locked, at(LOGIN_LOCK_MS))).toBe(false);
  });

  it("les essais s'oublient après 15 minutes sans tentative", () => {
    const two = claims(2)!;
    expect(nextGuardState(two, at(LOGIN_WINDOW_MS - 1)).attempts).toBe(3);
    expect(nextGuardState(two, at(LOGIN_WINDOW_MS)).attempts).toBe(1);
  });
});
