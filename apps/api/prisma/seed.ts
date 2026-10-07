import { runDemoImport } from "../src/database/demo-import.js";

/**
 * Données de démonstration : `pnpm --filter @kemdia/api db:seed` (relançable sans créer de doublon).
 * Refusé en production : le vrai catalogue est saisi par l'équipe et les vendeurs.
 * Le code est dans `src/database/demo-import.ts`, partagé avec l'image Docker de la démo Render (S3-T07).
 */
process.exitCode = await runDemoImport({
  env: process.env,
  allowedEnvs: ["local", "demo", "staging"],
});
