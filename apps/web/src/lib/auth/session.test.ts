import { describe, expect, it, vi } from "vitest";
import { SESSION_CACHE_MS, createSessionCache } from "./session";

const TOKEN = "S".repeat(43);
const OK = {
  ok: true as const,
  data: {
    expiresAt: "2026-11-07T10:00:00.000Z",
    account: {
      id: "11111111-1111-4111-8111-111111111111",
      firstName: "Awa",
      lastName: "Ndong",
      email: "awa@exemple.ga",
      phone: null,
    },
  },
};

describe("mémoire courte des sessions (10 s)", () => {
  it("une page et ses préchargements : un seul appel ; une déconnexion l'oublie aussitôt", async () => {
    const lookup = vi.fn(() => Promise.resolve(OK));
    const cache = createSessionCache(lookup);
    const now = 1_000_000;
    await Promise.all([
      cache.check(TOKEN, now),
      cache.check(TOKEN, now),
      cache.check(TOKEN, now + 5000),
    ]);
    expect(lookup).toHaveBeenCalledTimes(1);
    await cache.check(TOKEN, now + SESSION_CACHE_MS + 1);
    expect(lookup).toHaveBeenCalledTimes(2);
    cache.forget(TOKEN);
    await cache.check(TOKEN, now + SESSION_CACHE_MS + 2);
    expect(lookup).toHaveBeenCalledTimes(3);
    cache.clear();
    await cache.check(TOKEN, now + SESSION_CACHE_MS + 3);
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it("une panne de l'API n'est pas gardée ; une session refusée l'est", async () => {
    const lookup = vi.fn(() =>
      Promise.resolve({ ok: false as const, code: "INDISPONIBLE" as const }),
    );
    const cache = createSessionCache(lookup);
    await cache.check(TOKEN, 1);
    await new Promise((r) => setTimeout(r, 0));
    await cache.check(TOKEN, 2);
    expect(lookup).toHaveBeenCalledTimes(2);

    const refused = vi.fn(() =>
      Promise.resolve({ ok: false as const, code: "SESSION_INVALIDE" as const }),
    );
    const other = createSessionCache(refused);
    await other.check(TOKEN, 1);
    await new Promise((r) => setTimeout(r, 0));
    await other.check(TOKEN, 2);
    expect(refused).toHaveBeenCalledTimes(1);
  });
});
