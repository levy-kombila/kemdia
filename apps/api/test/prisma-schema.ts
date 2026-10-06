import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Règles de l'ADR-0006 appliquées au schéma Prisma (prisma/schema/*.prisma) :
 * 1. un fichier par module ; chaque modèle et énumération porte @@schema("<module du fichier>") ;
 * 2. la liste `schemas` de main.prisma contient exactement les modules ;
 * 3. aucune relation vers un modèle d'un autre module (pas de jointure entre schémas : on échange des UUID).
 */

export interface PrismaFile {
  module: string;
  source: string;
}

interface Block {
  kind: "model" | "enum" | "view";
  name: string;
  body: string;
}

const BLOCK = /^(model|enum|view)\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

/** Retire les commentaires `//` (en dehors des chaînes, suffisant pour un schéma Prisma). */
const stripComments = (source: string) => source.replace(/\/\/.*$/gm, "");

export function blocksOf(source: string): Block[] {
  return [...stripComments(source).matchAll(BLOCK)].map((m) => ({
    kind: m[1] as Block["kind"],
    name: m[2] as string,
    body: m[3] as string,
  }));
}

/** Noms de types utilisés par les champs d'un modèle (ex. `categorie Categorie? @relation(...)`). */
function fieldTypes(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/)[1] ?? "")
    .map((type) => type.replace(/[?[\]]/g, ""))
    .filter(Boolean);
}

export function checkPrismaSchema(files: readonly PrismaFile[]): string[] {
  const problems: string[] = [];
  const main = files.find((f) => f.module === "main");
  const modules = files.filter((f) => f.module !== "main");

  // Règle 2
  const declared = /schemas\s*=\s*\[([^\]]*)\]/.exec(stripComments(main?.source ?? ""))?.[1];
  const schemas = (declared ?? "").match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
  const expected = modules.map((f) => f.module).sort();
  if (JSON.stringify([...schemas].sort()) !== JSON.stringify(expected)) {
    problems.push(
      `main.prisma : schemas = [${schemas.join(", ")}] au lieu de [${expected.join(", ")}] (un schéma par fichier de module)`,
    );
  }
  for (const file of modules) {
    if (/^(generator|datasource)\s/m.test(stripComments(file.source))) {
      problems.push(`${file.module}.prisma : générateur et connexion vont dans main.prisma`);
    }
  }

  // Règle 1
  const owner = new Map<string, string>();
  for (const file of modules) {
    for (const block of blocksOf(file.source)) {
      owner.set(block.name, file.module);
      const schema = /@@schema\("([^"]+)"\)/.exec(block.body)?.[1];
      if (schema !== file.module) {
        problems.push(
          `${file.module}.prisma : ${block.kind} ${block.name} doit porter @@schema("${file.module}")`,
        );
      }
    }
  }
  if (main && blocksOf(main.source).length > 0) {
    problems.push("main.prisma : aucun modèle ici, seulement dans le fichier du module");
  }

  // Règle 3
  for (const file of modules) {
    for (const block of blocksOf(file.source).filter((b) => b.kind === "model")) {
      for (const type of fieldTypes(block.body)) {
        const other = owner.get(type);
        if (other && other !== file.module) {
          problems.push(
            `${file.module}.prisma : ${block.name} référence ${type} du module « ${other} » — stocker son UUID, sans relation`,
          );
        }
      }
    }
  }
  return problems;
}

export function readPrismaFiles(dir: string): PrismaFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".prisma"))
    .map((f) => ({ module: basename(f, ".prisma"), source: readFileSync(join(dir, f), "utf8") }));
}
