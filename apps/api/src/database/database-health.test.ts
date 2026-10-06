import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseHealth, PING_TIMEOUT_MS } from "./database-health.js";
import type { PrismaService } from "./prisma.service.js";

const prismaThat = (queryRaw: () => Promise<unknown>) =>
  ({ $queryRaw: vi.fn(queryRaw) }) as unknown as PrismaService;

/** Remplace le journal de l'instance par un espion (et évite des messages dans la sortie des tests). */
const silenceLogger = (health: DatabaseHealth) => {
  const warn = vi.fn<(message: string) => void>();
  (health as unknown as { logger: { warn: typeof warn } }).logger.warn = warn;
  return warn;
};

describe("DatabaseHealth", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("« ok » quand PostgreSQL répond", async () => {
    await expect(new DatabaseHealth(prismaThat(() => Promise.resolve([1]))).check()).resolves.toBe(
      "ok",
    );
  });

  it("« indisponible » quand la connexion échoue, sans journaliser le mot de passe", async () => {
    const health = new DatabaseHealth(
      prismaThat(() =>
        Promise.reject(new Error("échec pour postgresql://kemdia:motdepasse@db:5432/kemdia")),
      ),
    );
    const warn = silenceLogger(health);

    await expect(health.check()).resolves.toBe("indisponible");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("postgresql://***@db:5432/kemdia"));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("motdepasse");
  });

  it("« indisponible » si la base ne répond pas à temps", async () => {
    vi.useFakeTimers();
    const health = new DatabaseHealth(prismaThat(() => new Promise(() => {})));
    silenceLogger(health);
    const result = health.check();
    await vi.advanceTimersByTimeAsync(PING_TIMEOUT_MS + 1);
    await expect(result).resolves.toBe("indisponible");
  });
});
