import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Budget de performance (S2-T08) : chaque page clé est chargée « à froid » (cache vide) sur un téléphone de milieu de gamme
 * avec une connexion 3G, et doit respecter le budget ci-dessous. Mesure faite par le navigateur lui-même (Web Vitals),
 * sans outil supplémentaire.
 */
export const NETWORK_3G = { latency: 300, downloadKbps: 1600, uploadKbps: 750 };
export const CPU_SLOWDOWN = 4;

const BUDGET = {
  fcp: 2000, // premier affichage (ms)
  lcp: 2500, // plus grand élément affiché (ms) — « bon » selon Google
  cls: 0.1, // décalages de mise en page
  tbt: 300, // blocage du fil principal (ms) — indicatif, voir plus bas
  jsKb: 300, // JavaScript transféré (Ko compressés)
  totalKb: 1200, // poids total transféré (Ko)
};

type Budget = typeof BUDGET;

/** Pages d'arrivée (liens WhatsApp, Google) + panier. Les exceptions sont justifiées et suivies comme dette. */
const PAGES: { name: string; path: string; override?: Partial<Budget>; why?: string }[] = [
  {
    name: "Accueil",
    path: "/",
    override: { tbt: 650 },
    why: "≈ 50 cartes produits à rendre interactives ; objectif 300 ms avec le chargement progressif de l'API (S3)",
  },
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
};

async function measure(page: Page, path: string): Promise<Metrics> {
  await page.addInitScript(() => {
    const w = window as unknown as { __perf: { lcp: number; cls: number; tbt: number } };
    w.__perf = { lcp: 0, cls: 0, tbt: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__perf.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!e.hadRecentInput) w.__perf.cls += e.value;
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
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(1500); // laisse arriver les dernières mesures (LCP, tâches longues)

  return page.evaluate(() => {
    const w = window as unknown as { __perf: { lcp: number; cls: number; tbt: number } };
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
    };
  });
}

/** 3 chargements à froid, on garde la médiane de chaque mesure (les machines de CI sont bruitées). */
const RUNS = 3;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function measureMedian(
  browser: Browser,
  path: string,
  use: Parameters<Browser["newContext"]>[0],
): Promise<Metrics> {
  const runs: Metrics[] = [];
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext(use); // cache vide à chaque fois
    runs.push(await measure(await context.newPage(), path));
    await context.close();
  }
  const keys = Object.keys(runs[0]!) as (keyof Metrics)[];
  return Object.fromEntries(keys.map((k) => [k, median(runs.map((r) => r[k]))])) as Metrics;
}

for (const { name, path, override, why } of PAGES) {
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
    const m = await measureMedian(browser, path, {
      ...contextOptions,
      viewport,
      userAgent,
      deviceScaleFactor,
      isMobile,
      hasTouch,
    });
    // Un fichier par page : la CI les rassemble dans un tableau (scripts/perf-summary.mjs)
    mkdirSync("test-results/performance", { recursive: true });
    writeFileSync(
      `test-results/performance/${path.replace(/[^a-z0-9]+/gi, "_") || "accueil"}.json`,
      JSON.stringify({ page: name, ...m, budget: b, why, network: NETWORK_3G, cpu: CPU_SLOWDOWN }),
    );
    console.log(`[perf] ${name} ${JSON.stringify(m)}`);
    expect.soft(m.fcp, "premier affichage (ms)").toBeLessThanOrEqual(b.fcp);
    expect.soft(m.lcp, "plus grand élément (ms)").toBeLessThanOrEqual(b.lcp);
    expect.soft(m.cls, "décalages de mise en page").toBeLessThanOrEqual(b.cls);
    // Le blocage dépend beaucoup de la machine (les serveurs de CI sont partagés et irréguliers) :
    // il est affiché dans le résumé et signalé, mais ne bloque pas la PR.
    if (m.tbt > b.tbt)
      test.info().annotations.push({
        type: "avertissement",
        description: `Blocage ${m.tbt} ms > ${b.tbt} ms`,
      });
    expect.soft(m.jsKb, "JavaScript (Ko)").toBeLessThanOrEqual(b.jsKb);
    expect.soft(m.totalKb, "poids total (Ko)").toBeLessThanOrEqual(b.totalKb);
  });
}
