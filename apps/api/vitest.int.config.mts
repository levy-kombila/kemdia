import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Tests d'intégration (vraie base PostgreSQL) : `pnpm test:int`, jamais lancés par `pnpm test`.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["test/**/*.int.test.ts"],
    // Une seule base partagée : les fichiers passent l'un après l'autre
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
