import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Budget de performance (S2-T08) : chaque page clé est chargée « à froid » (cache vide) sur un téléphone de milieu de gamme
 * avec une connexion 3G, et doit respecter le budget ci-dessous. Mesure faite par le navigateur lui-même (Web Vitals),
 * sans outil supplémentaire.
 */
export const NETWORK_3G = { latency: 300, downloadKbps: 1600, uploadKbps: 750 };
export const CPU_SLOWDOWN = 4;

/**
 * Étalonnage du processeur (S8-T04, ADR-0059). Les serveurs de CI n'ont pas tous la même vitesse : avec un
 * ralentissement fixe (×4), le « téléphone » simulé était plus ou moins rapide selon la machine du jour, et le blocage
 * de l'accueil variait de 82 à 351 ms pour le même code. Un petit calcul fixe est chronométré dans le navigateur au
 * début ; le ralentissement est ajusté pour que ce calcul dure toujours autant que sur la machine de référence ralentie
 * ×4 (même principe que l'étalonnage conseillé pour Lighthouse). Bornes : ×2 à ×8. Sans référence : ×4 fixe.
 */
export const CALIBRATION_REFERENCE_MS: number | null = null;
const SLOWDOWN_BOUNDS = [2, 8] as const;

/** Calcul de référence : objets, chaînes et JSON, comme le chargement d'une page. Médiane de 7 passages (ms). */
function benchmark(): number {
  const runs: number[] = [];
  for (let r = 0; r < 7; r++) {
    const start = performance.now();
    let acc = 0;
    for (let i = 0; i < 450_000; i++) {
      const o = { id: i, label: `article-${i}`, tags: [i % 7, i % 11] };
      acc += o.label.length + o.tags[1]!;
    }
    const rows = Array.from({ length: 45_000 }, (_, i) => ({
      id: i,
      name: `produit ${i}`,
      price: i * 3,
    }));
    acc += (JSON.parse(JSON.stringify(rows)) as unknown[]).length;
    runs.push(performance.now() - start + (acc < 0 ? 1 : 0));
  }
  return runs.sort((a, b) => a - b)[3]!;
}

type Calibration = { benchMs: number; rate: number };
let calibration: Calibration | undefined;

async function calibrate(browser: Browser): Promise<Calibration> {
  if (calibration) return calibration;
  const context = await browser.newContext();
  const page = await context.newPage();
  const benchMs = Math.round((await page.evaluate(benchmark)) * 10) / 10;
  await context.close();
  const [min, max] = SLOWDOWN_BOUNDS;
  const rate =
    CALIBRATION_REFERENCE_MS === null
      ? CPU_SLOWDOWN
      : Math.round(
          Math.min(max, Math.max(min, (CPU_SLOWDOWN * CALIBRATION_REFERENCE_MS) / benchMs)) * 100,
        ) / 100;
  calibration = { benchMs, rate };
  return calibration;
}

const BUDGET = {
  fcp: 2000, // premier affichage (ms)
  lcp: 2500, // plus grand élément affiché (ms) — « bon » selon Google
  cls: 0.1, // décalages de mise en page
  tbt: 300, // blocage du fil principal (ms) — avertissement au-delà, voir plus bas
  tbtMax: 0, // blocage au-delà duquel la PR échoue (0 : jamais, la mesure reste indicative)
  jsKb: 300, // JavaScript transféré (Ko compressés)
  totalKb: 1200, // poids total transféré (Ko)
};

type Budget = typeof BUDGET;

/** Pages d'arrivée (liens WhatsApp, Google) + panier. Les exceptions sont justifiées et suivies comme dette. */
const PAGES: {
  name: string;
  path: string;
  override?: Partial<Budget>;
  why?: string;
  /** Chargements à froid dont on garde la médiane (3 par défaut) */
  runs?: number;
}[] = [
  // Accueil : budget commun depuis le S3-T08 (zones chargées progressivement, mise en page différée hors écran).
  // S7-T03 (ADR-0042) : blocage BLOQUANT au-delà de 350 ms (avertissement au-delà de 300 ms) — marge pour les
  // serveurs de CI, partagés et irréguliers (choix du 2026-10-18).
  { name: "Accueil", path: "/", override: { tbtMax: 350 }, runs: 5 },
  { name: "Catégorie", path: "/categorie/high-tech" },
  { name: "Fiche produit", path: "/produit/apple-google-pixel-modern-blanc" },
  { name: "Recherche", path: "/recherche?q=noir" },
  {
    name: "Panier",
    path: "/panier",
    override: { lcp: 3000 },
    why: "contenu lu sur l'appareil, donc affiché après le JavaScript ; page rarement ouverte à froid",
  },
];

type Metrics = {
  fcp: number;
  lcp: number;
  cls: number;
  tbt: number;
  jsKb: number;
  totalKb: number;
  shifts?: string[];
};

async function measure(page: Page, path: string, cpuRate: number): Promise<Metrics> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __perf: { lcp: number; cls: number; tbt: number; shifts: string[] };
    };
    w.__perf = { lcp: 0, cls: 0, tbt: 0, shifts: [] };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__perf.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    type Shift = PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
      sources?: {
        node?: Node | null;
        previousRect: DOMRectReadOnly;
        currentRect: DOMRectReadOnly;
      }[];
    };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as Shift[]) {
        if (e.hadRecentInput) continue;
        w.__perf.cls += e.value;
        // Pour comprendre un dépassement : quels éléments ont bougé, et de combien
        for (const src of e.sources ?? []) {
          const el = src.node instanceof Element ? src.node : src.node?.parentElement;
          const name = el
            ? `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`
            : "?";
          w.__perf.shifts.push(
            `${e.value.toFixed(3)} ${name} y${Math.round(src.previousRect.y)}→${Math.round(src.currentRect.y)} h${Math.round(src.previousRect.height)}→${Math.round(src.currentRect.height)}`,
          );
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__perf.tbt += Math.max(0, e.duration - 50);
    }).observe({ type: "longtask", buffered: true });
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: NETWORK_3G.latency,
    downloadThroughput: (NETWORK_3G.downloadKbps * 1000) / 8,
    uploadThroughput: (NETWORK_3G.uploadKbps * 1000) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });

  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(1500); // laisse arriver les dernières mesures (LCP, tâches longues)

  return page.evaluate(() => {
    const w = window as unknown as {
      __perf: { lcp: number; cls: number; tbt: number; shifts: string[] };
    };
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const js = res
      .filter((r) => r.name.endsWith(".js") || r.initiatorType === "script")
      .reduce((s, r) => s + r.transferSize, 0);
    const total = res.reduce((s, r) => s + r.transferSize, 0) + (nav?.transferSize ?? 0);
    return {
      fcp: Math.round(fcp),
      lcp: Math.round(w.__perf.lcp || fcp),
      cls: Math.round(w.__perf.cls * 1000) / 1000,
      tbt: Math.round(w.__perf.tbt),
      jsKb: Math.round(js / 1024),
      totalKb: Math.round(total / 1024),
      shifts: w.__perf.shifts.slice(0, 8),
    };
  });
}

/** Chargements à froid, on garde la médiane de chaque mesure (les machines de CI sont bruitées). */
const RUNS = 3;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function measureMedian(
  browser: Browser,
  path: string,
  use: Parameters<Browser["newContext"]>[0],
  count: number,
  cpuRate: number,
): Promise<Metrics & { tbtRuns: number[] }> {
  const runs: Metrics[] = [];
  for (let i = 0; i < count; i++) {
    const context = await browser.newContext(use); // cache vide à chaque fois
    runs.push(await measure(await context.newPage(), path, cpuRate));
    await context.close();
  }
  const keys = ["fcp", "lcp", "cls", "tbt", "jsKb", "totalKb"] as const;
  const result = Object.fromEntries(
    keys.map((k) => [k, median(runs.map((r) => r[k]))]),
  ) as unknown as Metrics & { tbtRuns: number[] };
  result.shifts = (runs[runs.length - 1]?.shifts ?? []).slice(0, 8);
  result.tbtRuns = runs.map((r) => r.tbt); // pour comprendre une médiane surprenante
  return result;
}

for (const { name, path, override, why, runs = RUNS } of PAGES) {
  test(`budget de performance : ${name}`, async ({
    browser,
    contextOptions,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  }) => {
    const b: Budget = { ...BUDGET, ...override };
    const { benchMs, rate } = await calibrate(browser);
    const m = await measureMedian(
      browser,
      path,
      { ...contextOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch },
      runs,
      rate,
    );
    // Un fichier par page : la CI les rassemble dans un tableau (scripts/perf-summary.mjs)
    mkdirSync("test-results/performance", { recursive: true });
    writeFileSync(
      `test-results/performance/${path.replace(/[^a-z0-9]+/gi, "_") || "accueil"}.json`,
      JSON.stringify({
        page: name,
        ...m,
        budget: b,
        why,
        runs,
        network: NETWORK_3G,
        cpu: rate,
        calibration: { benchMs, referenceMs: CALIBRATION_REFERENCE_MS },
      }),
    );
    console.log(`[perf] ${name} ${JSON.stringify(m)} cpu×${rate} étalon ${benchMs} ms`);
    expect.soft(m.fcp, "premier affichage (ms)").toBeLessThanOrEqual(b.fcp);
    expect.soft(m.lcp, "plus grand élément (ms)").toBeLessThanOrEqual(b.lcp);
    expect
      .soft(m.cls, `décalages de mise en page — éléments : ${m.shifts?.join(" | ") || "aucun"}`)
      .toBeLessThanOrEqual(b.cls);
    // Le blocage dépend beaucoup de la machine (les serveurs de CI sont partagés et irréguliers) : au-delà du budget,
    // il est signalé ; il ne bloque la PR qu'au-delà de `tbtMax` (accueil seulement, S7-T03).
    if (b.tbtMax > 0)
      expect.soft(m.tbt, "blocage du fil principal (ms)").toBeLessThanOrEqual(b.tbtMax);
    if (m.tbt > b.tbt)
      test.info().annotations.push({
        type: "avertissement",
        description: `Blocage ${m.tbt} ms > ${b.tbt} ms`,
      });
    expect.soft(m.jsKb, "JavaScript (Ko)").toBeLessThanOrEqual(b.jsKb);
    expect.soft(m.totalKb, "poids total (Ko)").toBeLessThanOrEqual(b.totalKb);
  });
}
