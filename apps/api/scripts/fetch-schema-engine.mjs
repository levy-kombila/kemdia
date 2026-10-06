// Télécharge le moteur de migrations de Prisma et le range à un chemin fixe (construction de l'image, S3-T06).
//
//   node scripts/fetch-schema-engine.mjs <dossier de l'application> <fichier de destination>
//
// Pourquoi : `pnpm install` n'exécute pas le téléchargement automatique de Prisma (pnpm-workspace.yaml,
// ignoredBuiltDependencies). Dans l'image, le système de fichiers est en lecture seule et le moteur ne peut pas
// être téléchargé au moment de migrer : on le télécharge donc une fois, à la construction, pour la plateforme
// de l'image (Alpine : linux-musl-openssl-3.0.x). L'image fixe PRISMA_SCHEMA_ENGINE_BINARY sur ce chemin.
//
// Échoue (code 1) si le moteur est introuvable après téléchargement : une image sans moteur ne doit pas être publiée.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const [appDir, target] = process.argv.slice(2).map((path) => resolve(path));
if (!appDir || !target) {
  console.error(
    "Usage : node scripts/fetch-schema-engine.mjs <dossier de l'application> <destination>",
  );
  process.exit(2);
}

// @prisma/engines est une dépendance de prisma, lui-même dépendance de l'API
const fromApp = createRequire(join(appDir, "package.json"));
const fromPrisma = createRequire(fromApp.resolve("prisma/package.json"));
const enginesDir = dirname(fromPrisma.resolve("@prisma/engines/package.json"));

const run = spawnSync(process.execPath, [join(enginesDir, "scripts", "postinstall.js")], {
  stdio: "inherit",
  env: { ...process.env, CHECKPOINT_DISABLE: "1" },
});
if (run.status !== 0) process.exit(1);

const engines = readdirSync(enginesDir).filter((name) => /^schema-engine-/.test(name));
if (engines.length !== 1) {
  console.error(
    `Moteur de migrations introuvable après téléchargement (trouvés : ${engines.join(", ") || "aucun"}).`,
  );
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
renameSync(join(enginesDir, engines[0]), target);
chmodSync(target, 0o755);
console.log(`Moteur de migrations Prisma prêt : ${engines[0]} → ${target}`);
