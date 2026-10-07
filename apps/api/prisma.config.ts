import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Le fichier .env ne sert qu'au poste de développement (en production, les variables viennent du conteneur)
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    // Données de démonstration : pnpm db:seed
    seed: "node --import @swc-node/register/esm-register prisma/seed.ts",
  },
  // process.env et non env() : env() lève une erreur si la variable manque, or `prisma generate`
  // (CI, construction de l'image) n'a pas besoin de base de données.
  // Hors production, même valeur par défaut que l'API (LOCAL_DATABASE_URL, src/config/env.ts) : la base de
  // `docker compose up -d db`. Sans elle, `pnpm db:deploy` échouait si apps/api/.env ne contenait pas DATABASE_URL.
  datasource: {
    url:
      process.env.DATABASE_URL ??
      (process.env.NODE_ENV === "production"
        ? undefined
        : "postgresql://kemdia:kemdia@localhost:5432/kemdia"),
  },
});
