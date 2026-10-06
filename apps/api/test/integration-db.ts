/**
 * Garde-fou des tests d'intégration : ils VIDENT des tables. Ils ne tournent donc que sur une base
 * dont le nom finit par « _test » (ex. kemdia_test), jamais sur la base de développement ni sur une base réelle.
 */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL est requis pour les tests d'intégration");
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(
      `Base « ${name} » refusée : les tests d'intégration effacent des données. Utilisez une base dont le nom finit par _test.`,
    );
  }
  return url;
}
