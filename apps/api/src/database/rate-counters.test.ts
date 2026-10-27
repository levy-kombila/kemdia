import { describe, expect, it } from "vitest";
import { CountersThrottlerStorage } from "../http/rate-limit.js";
import { FallbackRateCounters, MemoryRateCounters, type RateCounters } from "./rate-counters.js";

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 27, 12, 0, 0) + seconds * 1000);

describe("compteurs partagés en mémoire (S8-T07)", () => {
  it("fenêtre fixe : compte, puis repart de 1 après la fin de la fenêtre", async () => {
    const counters = new MemoryRateCounters();
    expect((await counters.hit("k", 60_000, at(0))).hits).toBe(1);
    expect((await counters.hit("k", 60_000, at(30))).hits).toBe(2);
    const third = await counters.hit("k", 60_000, at(59));
    expect([third.hits, third.resetAt]).toEqual([3, at(60)]);
    expect((await counters.hit("k", 60_000, at(60))).hits).toBe(1);
    expect(await counters.read("k", at(61))).toMatchObject({ hits: 1, resetAt: at(120) });
    expect(await counters.read("autre", at(61))).toBeNull();
  });

  it("blocage au-delà de la limite : rien n'est compté pendant le blocage, puis on repart de 1", async () => {
    const counters = new MemoryRateCounters();
    const block = { limit: 2, ms: 120_000 };
    await counters.hit("k", 60_000, at(0), block);
    await counters.hit("k", 60_000, at(1), block);
    const over = await counters.hit("k", 60_000, at(2), block);
    expect([over.hits, over.blockedUntil]).toEqual([3, at(122)]);
    // Fenêtre finie, mais blocage en cours : toujours bloqué, rien de plus compté
    const still = await counters.hit("k", 60_000, at(90), block);
    expect([still.hits, still.blockedUntil]).toEqual([3, at(122)]);
    const after = await counters.hit("k", 60_000, at(122), block);
    expect([after.hits, after.blockedUntil]).toEqual([1, null]);
  });

  it("annulation (jamais sous zéro) et ménage des compteurs terminés", async () => {
    const counters = new MemoryRateCounters();
    await counters.hit("a", 60_000, at(0));
    await counters.undo("a", at(1));
    await counters.undo("a", at(1));
    expect((await counters.read("a", at(1)))?.hits).toBe(0);
    await counters.hit("b", 600_000, at(0));
    expect(await counters.purge(at(61))).toBe(1);
    expect(await counters.read("b", at(61))).not.toBeNull();
  });

  it("refuse une clé vide ou trop longue et une fenêtre nulle", async () => {
    const counters = new MemoryRateCounters();
    await expect(counters.hit("", 1000, at(0))).rejects.toThrow();
    await expect(counters.hit("x".repeat(201), 1000, at(0))).rejects.toThrow();
    await expect(counters.hit("k", 0, at(0))).rejects.toThrow();
  });
});

describe("stockage des limites de débit sur les compteurs (S8-T07)", () => {
  it("bloque au-delà de la limite pendant la durée de blocage, avec le délai en secondes", async () => {
    let now = at(0);
    const storage = new CountersThrottlerStorage(new MemoryRateCounters(), () => now);
    for (let i = 1; i <= 3; i++) {
      const record = await storage.increment("ip", 60_000, 3, 60_000, "default");
      expect([record.totalHits, record.isBlocked]).toEqual([i, false]);
    }
    now = at(10);
    const blocked = await storage.increment("ip", 60_000, 3, 60_000, "default");
    expect(blocked).toMatchObject({ isBlocked: true, timeToBlockExpire: 60 });
    // Une autre limite (nom différent) a son propre compteur
    expect((await storage.increment("ip", 60_000, 3, 60_000, "compte")).isBlocked).toBe(false);
    now = at(70);
    expect((await storage.increment("ip", 60_000, 3, 60_000, "default")).isBlocked).toBe(false);
  });

  it("clé très longue : remplacée par son empreinte au lieu d'une erreur", async () => {
    const storage = new CountersThrottlerStorage(new MemoryRateCounters(), () => at(0));
    const key = `compte:${"x".repeat(300)}`;
    expect((await storage.increment(key, 60_000, 5, 60_000, "compte")).totalHits).toBe(1);
    expect((await storage.increment(key, 60_000, 5, 60_000, "compte")).totalHits).toBe(2);
  });

  it("sans durée de blocage : bloqué tant que la fenêtre dure", async () => {
    let now = at(0);
    const storage = new CountersThrottlerStorage(new MemoryRateCounters(), () => now);
    await storage.increment("ip", 60_000, 1, 0, "default");
    now = at(20);
    expect(await storage.increment("ip", 60_000, 1, 0, "default")).toMatchObject({
      isBlocked: true,
      timeToBlockExpire: 40,
    });
  });
});

describe("repli en mémoire quand la base ne répond pas (S8-T07)", () => {
  const broken: RateCounters = {
    hit: () => Promise.reject(new Error("relation absente")),
    read: () => Promise.reject(new Error("relation absente")),
    undo: () => Promise.reject(new Error("relation absente")),
    purge: () => Promise.reject(new Error("relation absente")),
  };

  it("continue en mémoire, avec un seul avertissement par minute, sans valeur dans le message", async () => {
    const warnings: string[] = [];
    const counters = new FallbackRateCounters(broken, new MemoryRateCounters(), {
      warn: (message: string) => warnings.push(message),
    });
    expect((await counters.hit("limite:ip", 60_000, at(0))).hits).toBe(1);
    expect((await counters.hit("limite:ip", 60_000, at(1))).hits).toBe(2);
    expect((await counters.read("limite:ip", at(2)))?.hits).toBe(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain("limite:ip");
  });

  it("une clé invalide reste une erreur (pas un repli)", async () => {
    const counters = new FallbackRateCounters(new MemoryRateCounters(), new MemoryRateCounters(), {
      warn: () => undefined,
    });
    await expect(counters.hit("", 60_000, at(0))).rejects.toThrow("clé de compteur invalide");
  });

  it("clé bloquée par la base : plus aucune écriture jusqu'à la fin du blocage", async () => {
    const memory = new MemoryRateCounters();
    let writes = 0;
    const counting: RateCounters = {
      hit: (...args) => {
        writes++;
        return memory.hit(...args);
      },
      read: (key, now) => memory.read(key, now),
      undo: (key, now) => memory.undo(key, now),
      purge: (now) => memory.purge(now),
    };
    const counters = new FallbackRateCounters(counting, new MemoryRateCounters(), {
      warn: () => undefined,
    });
    const block = { limit: 1, ms: 60_000 };
    await counters.hit("ip", 60_000, at(0), block);
    expect((await counters.hit("ip", 60_000, at(1), block)).blockedUntil).toEqual(at(61));
    for (let i = 2; i < 50; i++) await counters.hit("ip", 60_000, at(i), block);
    expect(writes).toBe(2);
    // Blocage terminé : la base est de nouveau consultée
    expect((await counters.hit("ip", 60_000, at(61), block)).hits).toBe(1);
    expect(writes).toBe(3);
  });

  it("base trop lente : repli en mémoire au lieu d'attendre", async () => {
    const slow: RateCounters = {
      hit: () => new Promise(() => undefined),
      read: () => new Promise(() => undefined),
      undo: () => new Promise(() => undefined),
      purge: () => new Promise(() => undefined),
    };
    const warnings: string[] = [];
    const counters = new FallbackRateCounters(
      slow,
      new MemoryRateCounters(),
      { warn: (m: string) => warnings.push(m) },
      20,
    );
    expect((await counters.hit("ip", 60_000, at(0))).hits).toBe(1);
    expect(warnings[0]).toContain("CounterTimeoutError");
  });
});
