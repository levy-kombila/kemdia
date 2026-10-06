import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * Vérification de l'architecture (ADR-0006 + hexagonale), sans dépendance supplémentaire :
 * on lit les `import` de chaque fichier de src/modules et on applique les règles de src/modules/README.md.
 */

export type Layer = "domain" | "application" | "infrastructure" | "interface" | "root";

const LAYERS: readonly Layer[] = ["domain", "application", "infrastructure", "interface"];

/** Bibliothèques interdites par couche (préfixes de paquets). */
const FORBIDDEN_PACKAGES: Partial<Record<Layer, readonly string[]>> = {
  // Le domaine ne dépend même pas du contrat HTTP : les règles métier ne bougent pas quand l'API change
  domain: [
    "@nestjs/",
    "@prisma/",
    "express",
    "pino",
    "nestjs-pino",
    "zod",
    "rxjs",
    "@kemdia/contracts",
  ],
  // L'application peut lire les constantes du contrat (tris, bornes), pas ses schémas HTTP (couche interface)
  application: ["@prisma/", "express", "zod", "@kemdia/contracts"],
};

/** Exceptions explicites aux interdictions ci-dessus (constantes sans aucune dépendance). */
const ALLOWED_PACKAGES: Partial<Record<Layer, readonly string[]>> = {
  application: ["@kemdia/contracts/constants"],
};

/** Accès à la base (dossiers de src/) : réservé à la couche infrastructure des modules. */
const DATABASE_DIRS = ["database", "generated"] as const;

/** Couches internes qu'une couche n'a pas le droit d'importer. */
const FORBIDDEN_LAYERS: Partial<Record<Layer, readonly Layer[]>> = {
  domain: ["application", "infrastructure", "interface"],
  application: ["infrastructure", "interface"],
};

export interface Location {
  module: string;
  layer: Layer;
  /** Chemin relatif au dossier du module, avec « / ». */
  path: string;
}

/** Situe un fichier dans src/modules : module, couche. `null` s'il est hors des modules. */
export function locate(modulesDir: string, file: string): Location | null {
  const rel = relative(modulesDir, file);
  if (rel.startsWith("..")) return null;
  const parts = rel.split(sep);
  if (parts.length < 2) return null; // README.md, etc.
  const [module, ...rest] = parts as [string, ...string[]];
  const layer = LAYERS.includes(rest[0] as Layer) ? (rest[0] as Layer) : "root";
  return { module, layer, path: rest.join("/") };
}

/** Règles appliquées à un import `specifier` écrit dans `file`. Renvoie le problème ou `null`. */
export function checkImport(modulesDir: string, file: string, specifier: string): string | null {
  const from = locate(modulesDir, file);
  if (!from) return null;

  if (!specifier.startsWith(".")) {
    if (ALLOWED_PACKAGES[from.layer]?.includes(specifier)) return null;
    const banned = FORBIDDEN_PACKAGES[from.layer]?.find(
      (pkg) => specifier === pkg || specifier.startsWith(pkg.endsWith("/") ? pkg : `${pkg}/`),
    );
    return banned
      ? `${from.module}/${from.path} : la couche « ${from.layer} » ne doit pas importer « ${specifier} »`
      : null;
  }

  const absolute = resolve(dirname(file), specifier);
  const database = DATABASE_DIRS.find((dir) =>
    absolute.startsWith(join(dirname(modulesDir), dir) + sep),
  );
  if (database && from.layer !== "infrastructure") {
    return `${from.module}/${from.path} : seule la couche « infrastructure » accède à la base (src/${database})`;
  }

  const target = locate(modulesDir, absolute);
  if (!target) return null; // src/config, src/http… : socle technique partagé

  if (target.module !== from.module) {
    const isPublicPort = /^index(\.js|\.ts)?$/.test(target.path);
    return isPublicPort
      ? null
      : `${from.module}/${from.path} : passer par le port public « modules/${target.module}/index.ts » au lieu de « ${specifier} »`;
  }

  if (FORBIDDEN_LAYERS[from.layer]?.includes(target.layer)) {
    return `${from.module}/${from.path} : la couche « ${from.layer} » ne doit pas dépendre de « ${target.layer} »`;
  }
  return null;
}

const IMPORT =
  /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

/** Liste les `from "…"`, `import("…")` et `import "…"` d'un code source TypeScript. */
export function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT)].map((m) => (m[1] ?? m[2] ?? m[3]) as string);
}

/** Parcourt src/modules et renvoie toutes les violations. */
export function checkModules(modulesDir: string): string[] {
  const files = (readdirSync(modulesDir, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(modulesDir, f));
  return files.flatMap((file) =>
    importsOf(readFileSync(file, "utf8"))
      .map((spec) => checkImport(modulesDir, file, spec))
      .filter((v): v is string => v !== null),
  );
}
