import "server-only";
import { resolveCatalogSource, type CatalogSource } from "./catalog-source";

let source: CatalogSource | undefined;

/** Source du catalogue, lue une fois (la vérification au démarrage est dans src/instrumentation.ts). */
export function catalogSource(): CatalogSource {
  source ??= resolveCatalogSource(process.env);
  return source;
}
