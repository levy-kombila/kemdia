import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Données des parcours de bout en bout (`e2e/fixtures/*.sql`) : chaque fichier s'insère avec `ON CONFLICT DO NOTHING`.
 * Un identifiant de compte repris d'un autre fichier passe donc SANS erreur… et l'autre compte n'est jamais créé
 * (incident du S7-T02 : le compte vendeur des parcours n'existait plus). Ce test refuse tout doublon.
 */
const dir = join(process.cwd(), "e2e/fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));

/** Identifiants des comptes insérés : premier UUID de chaque ligne de valeurs de `identity.accounts`. */
function accountIds(sql: string): string[] {
  const ids: string[] = [];
  for (const block of sql.split(/INSERT INTO "identity"\."accounts"/).slice(1)) {
    const values = block.slice(0, block.search(/;\s*$/m) + 1 || undefined);
    for (const row of values.matchAll(/\(\s*'([0-9a-f-]{36})'/g)) ids.push(row[1]!);
  }
  return ids;
}

describe("données des parcours de bout en bout", () => {
  it("aucun identifiant de compte n'est repris d'un fichier à l'autre", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const file of files) {
      for (const id of new Set(accountIds(readFileSync(join(dir, file), "utf8")))) {
        const other = owner.get(id);
        if (other) clashes.push(`${id} : ${other} et ${file}`);
        else owner.set(id, file);
      }
    }
    expect(owner.size).toBeGreaterThanOrEqual(4);
    expect(clashes).toEqual([]);
  });
});
