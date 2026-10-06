// Rassemble test-results/performance/*.json en tableau Markdown pour le résumé de la CI (GITHUB_STEP_SUMMARY).
import { readdirSync, readFileSync } from "node:fs";

const dir = "test-results/performance";
let results = [];
try {
  results = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
} catch {
  /* aucun résultat */
}
if (results.length === 0) {
  console.log("Aucune mesure de performance (le test n'a pas tourné).");
  process.exit(0);
}
const order = ["Accueil", "Catégorie", "Fiche produit", "Recherche", "Panier"];
results.sort((a, b) => order.indexOf(a.page) - order.indexOf(b.page));
const cell = (v, max) => (v <= max ? `${v} / ${max}` : `**${v}** / ${max} ❌`);
const { network, cpu } = results[0];
console.log(
  [
    "## Budget de performance (téléphone, 3G, cache vide, médiane de 3 chargements)",
    "",
    `Réseau simulé : ${network.downloadKbps} kbit/s, latence ${network.latency} ms · processeur ralenti ×${cpu}`,
    "",
    "| Page | Premier affichage (ms) | Plus grand élément (ms) | Décalages | Blocage (ms) | JS (Ko) | Total (Ko) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.page} | ${cell(r.fcp, r.budget.fcp)} | ${cell(r.lcp, r.budget.lcp)} | ${cell(r.cls, r.budget.cls)} | ${cell(r.tbt, r.budget.tbt)} | ${cell(r.jsKb, r.budget.jsKb)} | ${cell(r.totalKb, r.budget.totalKb)} |`,
    ),
    "",
    ...results.filter((r) => r.why).map((r) => `- **${r.page}** : budget adapté, ${r.why}.`),
  ].join("\n"),
);
