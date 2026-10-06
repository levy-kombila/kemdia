import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // src/generated : client Prisma généré (`pnpm generate`), jamais modifié à la main
  { ignores: ["dist/**", "coverage/**", "src/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // NestJS injecte les dépendances par le type du constructeur : l'import doit rester une valeur
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  {
    // Les comparateurs de Vitest (expect.stringMatching…) sont typés « any »
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-unsafe-assignment": "off" },
  },
  {
    files: ["**/*.mjs", "**/*.mts"],
    ...tseslint.configs.disableTypeChecked,
  },
);
