import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // "server-only" lève une erreur hors du runtime serveur de Next : neutralisé pour les tests unitaires
    alias: { "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: { reporter: ["text", "lcov"], include: ["src/lib/**"] },
  },
});
