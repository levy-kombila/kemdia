import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC compile les décorateurs NestJS (et leurs métadonnées de types), ce que esbuild ne sait pas faire.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Les tests d'intégration (vraie base) ont leur propre configuration : vitest.int.config.mts
    exclude: ["**/node_modules/**", "**/*.int.test.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/**"],
      exclude: ["src/main.ts", "src/generated/**"],
    },
  },
});
