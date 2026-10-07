import { describe, expect, it, vi } from "vitest";
import { startDemo } from "./start-demo.js";

function steps(migrate = 0, importDemo = 0) {
  const order: string[] = [];
  return {
    order,
    steps: {
      migrate: vi.fn(() => (order.push("migrations"), Promise.resolve(migrate))),
      importDemo: vi.fn(() => (order.push("import"), Promise.resolve(importDemo))),
      startApi: vi.fn(() => (order.push("api"), Promise.resolve())),
    },
  };
}

describe("startDemo (node dist/database/start-demo.js)", () => {
  it("dans l'ordre : migrations, import de démonstration, puis l'API", async () => {
    const run = steps();
    await expect(startDemo({ APP_ENV: "demo" }, run.steps, vi.fn())).resolves.toBe(0);
    expect(run.order).toEqual(["migrations", "import", "api"]);
  });

  it("refusé hors démo : rien n'est lancé (staging et production gardent l'ordre de l'ADR-0012)", async () => {
    for (const APP_ENV of [undefined, "local", "staging", "production"]) {
      const run = steps();
      const error = vi.fn();
      await expect(startDemo({ APP_ENV }, run.steps, error)).resolves.toBe(1);
      expect(run.order).toEqual([]);
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/APP_ENV doit valoir « demo »/));
    }
  });

  it("migrations en échec : ni import ni API (Render garde l'ancienne version)", async () => {
    const run = steps(1);
    await expect(startDemo({ APP_ENV: "demo" }, run.steps, vi.fn())).resolves.toBe(1);
    expect(run.order).toEqual(["migrations"]);
  });

  it("import en échec : l'API ne démarre pas", async () => {
    const run = steps(0, 1);
    await expect(startDemo({ APP_ENV: "demo" }, run.steps, vi.fn())).resolves.toBe(1);
    expect(run.order).toEqual(["migrations", "import"]);
  });
});
