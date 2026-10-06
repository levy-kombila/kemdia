import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Le fichier .env ne sert qu'au poste de développement (en production, les variables viennent du conteneur)
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema",
  migrations: { path: "prisma/migrations" },
  // process.env et non env() : env() lève une erreur si la variable manque, or `prisma generate`
  // (CI, construction de l'image) n'a pas besoin de base de données.
  datasource: { url: process.env.DATABASE_URL },
});
