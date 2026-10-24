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

// --annotations : une ligne par page, en annotation GitHub (lisible dans la PR et par l'API GitHub, S3-T08)
if (process.argv.includes("--annotations")) {
  for (const r of results) {
    console.log(
      `::notice title=Performance — ${r.page}::premier affichage ${r.fcp} ms · plus grand élément ${r.lcp} ms · ` +
        `décalages ${r.cls} · blocage ${r.tbt} ms (budget ${r.budget.tbt}${r.budget.tbtMax ? `, bloquant au-delà de ${r.budget.tbtMax}` : ""}` +
        `${r.tbtRuns ? ` ; chargements ${r.tbtRuns.join(", ")}` : ""}) · JS ${r.jsKb} Ko · total ${r.totalKb} Ko · ` +
        `processeur ×${r.cpu}${r.calibration ? ` (étalon ${r.calibration.benchMs} ms)` : ""}`,
    );
  }
  process.exit(0);
}
const cell = (v, max, soft = false) =>
  v <= max ? `${v} / ${max}` : `**${v}** / ${max} ${soft ? "⚠️" : "❌"}`;
/** Blocage : signalé au-delà du budget, bloquant au-delà de `tbtMax` (accueil, S7-T03). */
const tbtCell = (r) =>
  r.budget.tbtMax && r.tbt > r.budget.tbtMax
    ? `**${r.tbt}** / ${r.budget.tbt} (max ${r.budget.tbtMax}) ❌`
    : cell(r.tbt, r.budget.tbt, true) + (r.budget.tbtMax ? ` (max ${r.budget.tbtMax})` : "");
const { network, cpu, calibration } = results[0];
console.log(
  [
    "## Budget de performance (téléphone, 3G, cache vide, médiane de 3 chargements, 5 pour l'accueil)",
    "",
    `Réseau simulé : ${network.downloadKbps} kbit/s, latence ${network.latency} ms · processeur ralenti ×${cpu}` +
      (calibration
        ? ` (étalonnage S8-T04 : calcul de référence ${calibration.benchMs} ms sur cette machine` +
          (calibration.referenceMs
            ? `, ${calibration.referenceMs} ms sur la machine de référence)`
            : ", sans référence : ×4 fixe)")
        : ""),
    "",
    "| Page | Premier affichage (ms) | Plus grand élément (ms) | Décalages | Blocage (ms) | JS (Ko) | Total (Ko) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.page} | ${cell(r.fcp, r.budget.fcp)} | ${cell(r.lcp, r.budget.lcp)} | ${cell(r.cls, r.budget.cls)} | ${tbtCell(r)} | ${cell(r.jsKb, r.budget.jsKb)} | ${cell(r.totalKb, r.budget.totalKb)} |`,
    ),
    "",
    "❌ bloque la PR · ⚠️ signalé seulement (le blocage du fil principal varie selon la machine de CI ; l'accueil bloque au-delà de son maximum).",
    "",
    ...results.filter((r) => r.why).map((r) => `- **${r.page}** : budget adapté, ${r.why}.`),
  ].join("\n"),
);
