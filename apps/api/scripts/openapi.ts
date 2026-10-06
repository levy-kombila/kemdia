import { writeFileSync } from "node:fs";
import { buildOpenApiDocument } from "../src/docs/openapi.js";

/**
 * Écrit la description OpenAPI dans docs/api/openapi.json : `pnpm --filter @kemdia/api openapi`.
 * Le fichier est versionné : chaque changement de l'API apparaît dans le diff de la PR.
 * Un test (test/openapi.test.ts) échoue s'il n'est pas à jour.
 */
const target = new URL("../../../docs/api/openapi.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
console.log(`Description OpenAPI écrite : ${target.pathname}`);
