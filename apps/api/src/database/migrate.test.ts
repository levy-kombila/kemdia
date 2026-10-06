import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { API_ROOT, prismaCli, runMigrations } from "./migrate.js";

const PROD = {
  NODE_ENV: "production",
  APP_ENV: "staging",
  APP_VERSION: "sha-abc123",
  DATABASE_URL: "postgresql://kemdia:s3cret-pass@db.interne:5432/kemdia",
};

/** Faux processus Prisma : se termine avec le code donné (ou ne se termine jamais). */
function fakeSpawn(exitCode: number | "never" | "error" = 0) {
  const calls: { command: string; args: readonly string[]; options: SpawnOptions }[] = [];
  const children: (EventEmitter & { kill: ReturnType<typeof vi.fn> })[] = [];
  const spawn = (command: string, args: readonly string[], options: SpawnOptions) => {
    calls.push({ command, args, options });
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(() => queueMicrotask(() => child.emit("exit", null, "SIGTERM"))),
    });
    children.push(child);
    if (exitCode === "error") queueMicrotask(() => child.emit("error", new Error("ENOENT")));
    else if (exitCode !== "never") queueMicrotask(() => child.emit("exit", exitCode, null));
    return child as unknown as ChildProcess;
  };
  return { spawn, calls, children };
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, log: (m: string) => out.push(m), error: (m: string) => err.push(m) };
}

describe("runMigrations (node dist/database/migrate.js)", () => {
  it("lance « prisma migrate deploy » depuis le dossier de l'API, sans appel aux serveurs de Prisma", async () => {
    const fake = fakeSpawn(0);
    const io = capture();
    await expect(runMigrations({ env: PROD, spawn: fake.spawn, ...io })).resolves.toBe(0);

    expect(fake.calls).toHaveLength(1);
    const { command, args, options } = fake.calls[0]!;
    expect(command).toBe(process.execPath);
    expect(args).toEqual([prismaCli(), "migrate", "deploy"]);
    expect(options.cwd).toBe(API_ROOT);
    expect(options.env).toMatchObject({
      DATABASE_URL: PROD.DATABASE_URL,
      CHECKPOINT_DISABLE: "1",
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
    });
    expect(io.out.join("\n")).toMatch(/sha-abc123 \(staging\)[\s\S]*la base est à jour/);
  });

  it("vérifie la configuration comme l'API : production sans base → refus (code 1), Prisma n'est pas lancé", async () => {
    const fake = fakeSpawn(0);
    const io = capture();
    const sansBase: NodeJS.ProcessEnv = { ...PROD, DATABASE_URL: undefined };
    await expect(runMigrations({ env: sansBase, spawn: fake.spawn, ...io })).resolves.toBe(1);
    expect(fake.calls).toHaveLength(0);
    expect(io.err.join("\n")).toMatch(/DATABASE_URL : obligatoire en production/);
  });

  it("n'affiche jamais l'adresse de la base (elle contient le mot de passe)", async () => {
    const io = capture();
    await runMigrations({ env: PROD, spawn: fakeSpawn(1).spawn, ...io });
    await runMigrations({ env: { ...PROD, LOG_LEVEL: "debug" }, spawn: fakeSpawn(0).spawn, ...io });
    const everything = [...io.out, ...io.err].join("\n");
    expect(everything).not.toContain("s3cret-pass");
    expect(everything).not.toContain("db.interne");
  });

  it("échec de Prisma → code 1 et message clair", async () => {
    const io = capture();
    await expect(runMigrations({ env: PROD, spawn: fakeSpawn(1).spawn, ...io })).resolves.toBe(1);
    expect(io.err.join("\n")).toMatch(/ÉCHEC/);
  });

  it("Prisma impossible à lancer → code 1", async () => {
    const io = capture();
    await expect(
      runMigrations({ env: PROD, spawn: fakeSpawn("error").spawn, ...io }),
    ).resolves.toBe(1);
    expect(io.err.join("\n")).toMatch(/n'a pas pu être lancé/);
  });

  it("trop long → interrompu, code 1", async () => {
    const fake = fakeSpawn("never");
    const io = capture();
    await expect(
      runMigrations({ env: PROD, spawn: fake.spawn, timeoutMs: 20, ...io }),
    ).resolves.toBe(1);
    expect(fake.children[0]?.kill).toHaveBeenCalledWith("SIGTERM");
    expect(io.err.join("\n")).toMatch(/interrompues/);
  });

  it("le programme de Prisma et la configuration des migrations sont bien là où le script les cherche", () => {
    expect(existsSync(prismaCli())).toBe(true);
    expect(existsSync(join(API_ROOT, "prisma.config.ts"))).toBe(true);
    expect(existsSync(join(API_ROOT, "prisma", "migrations"))).toBe(true);
  });
});
