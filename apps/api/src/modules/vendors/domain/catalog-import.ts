/**
 * Import du vrai catalogue (S8-T03, ADR-0058) : un fichier CSV (exporté d'Excel ou de Google Sheets), une ligne par
 * variante. Les lignes d'une même boutique et d'une même « référence » forment UN produit. Ce fichier ne lit ni
 * n'écrit rien : il découpe le texte, vérifie chaque ligne et regroupe les produits. Toutes les erreurs sont
 * collectées (ligne, colonne, message) pour que l'équipe corrige le fichier en une fois.
 */

/** Colonnes du modèle, dans l'ordre du fichier fourni à l'équipe. `prix_barre` et `marque` sont facultatives. */
export const IMPORT_COLUMNS = [
  "boutique",
  "reference",
  "titre",
  "description",
  "marque",
  "categorie",
  "variante",
  "prix",
  "prix_barre",
  "stock",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
const REQUIRED: readonly ImportColumn[] = [
  "boutique",
  "reference",
  "titre",
  "description",
  "categorie",
  "prix",
  "stock",
];

/** Limites (mêmes valeurs que le contrat ; passées par l'application, le domaine n'importe rien). */
export interface ImportRules {
  maxRows: number;
  referenceMax: number;
  titleMin: number;
  titleMax: number;
  descriptionMin: number;
  descriptionMax: number;
  brandMin: number;
  brandMax: number;
  variantNameMax: number;
  variantsMax: number;
  priceMax: number;
  stockMax: number;
  /** Erreurs renvoyées au plus (les suivantes sont seulement comptées) */
  errorsMax: number;
}

export interface ImportIssue {
  /** Numéro de ligne dans le fichier (1 = en-têtes) ; 0 : le fichier entier */
  line: number;
  column: ImportColumn | null;
  message: string;
}

export interface ImportedVariant {
  line: number;
  name: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
}

export interface ImportedProduct {
  /** Première ligne du produit dans le fichier */
  line: number;
  shop: string;
  reference: string;
  title: string;
  description: string;
  brand: string | null;
  category: string;
  variants: ImportedVariant[];
}

export interface ParsedImport {
  products: ImportedProduct[];
  issues: ImportIssue[];
  /** Erreurs au total (seules `errorsMax` sont gardées dans `issues`) */
  issueCount: number;
  rows: number;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
/** Caractères de contrôle (hors retour à la ligne et tabulation) et inversions du sens d'écriture */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/;

/**
 * Découpe un CSV (RFC 4180) : séparateur « ; » (Excel en français) ou « , », deviné sur la ligne d'en-têtes ;
 * guillemets doublés ; retours à la ligne dans un champ entre guillemets ; BOM UTF-8 ignoré. `null` : guillemet
 * jamais refermé.
 */
export function splitCsv(text: string): string[][] | null {
  const source = text.startsWith("﻿") ? text.slice(1) : text;
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const separator =
    countOutsideQuotes(firstLine, ";") >= countOutsideQuotes(firstLine, ",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === separator) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) return null;
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Lignes entièrement vides (fin de fichier d'Excel) ignorées
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function countOutsideQuotes(line: string, separator: string): number {
  let count = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === separator && !quoted) count += 1;
  }
  return count;
}

/** En-tête comparé sans accents, majuscules ni espaces (« Prix barré » → `prix_barre`). */
function headerKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Montant FCFA entier : « 15000 », « 15 000 », « 15.000 » ; jamais de décimales (BR-004). */
function parseAmount(raw: string): number | null {
  const compact = raw.replace(/[\s\u00a0\u202f]/g, "").replace(/(?:fcfa|xaf|f)$/i, "");
  if (!/^\d{1,3}(?:\.\d{3})+$|^\d+$/.test(compact)) return null;
  const value = Number(compact.replace(/\./g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

const clean = (value: string) => value.replace(/\r\n?/g, "\n").trim();
const length = (value: string) => [...value].length;

/** Vérifie et regroupe les lignes ; ne s'arrête pas à la première erreur. */
export function parseCatalogImport(text: string, rules: ImportRules): ParsedImport {
  const issues: ImportIssue[] = [];
  let issueCount = 0;
  const issue = (line: number, column: ImportColumn | null, message: string) => {
    issueCount += 1;
    if (issues.length < rules.errorsMax) issues.push({ line, column, message });
  };
  const done = (products: ImportedProduct[], rows: number): ParsedImport => ({
    products: issueCount === 0 ? products : [],
    issues,
    issueCount,
    rows,
  });

  const table = splitCsv(text);
  if (table === null) {
    issue(0, null, "guillemet jamais refermé : vérifiez l'export du fichier (CSV)");
    return done([], 0);
  }
  const [header, ...rows] = table;
  if (!header) {
    issue(
      0,
      null,
      "fichier vide : utilisez le modèle (ligne d'en-têtes, puis une ligne par variante)",
    );
    return done([], 0);
  }
  const keys = header.map(headerKey);
  const index = new Map<ImportColumn, number>();
  keys.forEach((key, position) => {
    if ((IMPORT_COLUMNS as readonly string[]).includes(key)) {
      if (index.has(key as ImportColumn)) issue(1, key as ImportColumn, "colonne en double");
      else index.set(key as ImportColumn, position);
    } else if (key !== "")
      issue(1, null, `colonne inconnue « ${header[position]?.trim().slice(0, 40)} »`);
  });
  for (const column of REQUIRED)
    if (!index.has(column)) issue(1, column, "colonne obligatoire absente");
  if (issueCount > 0) return done([], rows.length);
  if (rows.length === 0) {
    issue(0, null, "aucune ligne de produit sous les en-têtes");
    return done([], 0);
  }
  if (rows.length > rules.maxRows) {
    issue(0, null, `${rows.length} lignes : ${rules.maxRows} au plus par fichier (découpez-le)`);
    return done([], rows.length);
  }

  const groups = new Map<string, ImportedProduct>();
  rows.forEach((cells, offset) => {
    const line = offset + 2;
    const get = (column: ImportColumn): string => {
      const position = index.get(column);
      return position === undefined ? "" : clean(cells[position] ?? "");
    };
    let valid = true;
    const fail = (column: ImportColumn, message: string) => {
      valid = false;
      issue(line, column, message);
    };
    for (const column of IMPORT_COLUMNS) {
      if (FORBIDDEN.test(get(column)))
        fail(column, "caractères interdits (contrôle ou sens d'écriture)");
    }

    const shop = get("boutique").toLowerCase();
    if (!SLUG.test(shop) || shop.length > 60)
      fail(
        "boutique",
        "adresse de boutique attendue (ex. « kemdia », comme dans /boutique/kemdia)",
      );
    const reference = get("reference");
    if (!reference)
      fail("reference", "référence obligatoire (elle regroupe les variantes d'un produit)");
    else if (length(reference) > rules.referenceMax || !REFERENCE.test(reference))
      fail(
        "reference",
        `${rules.referenceMax} caractères au plus : lettres, chiffres, « . », « _ », « - », « / »`,
      );
    const title = get("titre");
    if (length(title) < rules.titleMin || length(title) > rules.titleMax)
      fail("titre", `${rules.titleMin} à ${rules.titleMax} caractères`);
    const description = get("description");
    if (length(description) < rules.descriptionMin || length(description) > rules.descriptionMax)
      fail("description", `${rules.descriptionMin} à ${rules.descriptionMax} caractères`);
    const brand = get("marque");
    if (brand && (length(brand) < rules.brandMin || length(brand) > rules.brandMax))
      fail("marque", `vide, ou ${rules.brandMin} à ${rules.brandMax} caractères`);
    const category = get("categorie").toLowerCase();
    if (!SLUG.test(category) || category.length > 80)
      fail("categorie", "adresse de catégorie attendue (ex. « telephones-portables »)");
    const variantName = get("variante");
    if (length(variantName) > rules.variantNameMax)
      fail("variante", `${rules.variantNameMax} caractères au plus`);
    const price = parseAmount(get("prix"));
    if (price === null || price < 1 || price > rules.priceMax)
      fail("prix", `montant entier en FCFA, de 1 à ${rules.priceMax.toLocaleString("fr-FR")}`);
    const rawCompare = get("prix_barre");
    const compareAtPrice = rawCompare ? parseAmount(rawCompare) : null;
    if (rawCompare && (compareAtPrice === null || (price !== null && compareAtPrice <= price)))
      fail("prix_barre", "vide, ou montant entier plus élevé que le prix");
    const stockRaw = get("stock");
    const stock = /^\d{1,7}$/.test(stockRaw) ? Number(stockRaw) : null;
    if (stock === null || stock > rules.stockMax)
      fail("stock", `nombre entier de 0 à ${rules.stockMax.toLocaleString("fr-FR")}`);
    if (!valid || price === null || stock === null) return;

    const key = `${shop}\u0000${reference.toLowerCase()}`;
    const existing = groups.get(key);
    const variant: ImportedVariant = { line, name: variantName, price, compareAtPrice, stock };
    if (!existing) {
      groups.set(key, {
        line,
        shop,
        reference,
        title,
        description,
        brand: brand || null,
        category,
        variants: [variant],
      });
      return;
    }
    // Variante d'un produit déjà vu : même fiche obligatoire (un produit = un titre, une description…)
    if (
      existing.title !== title ||
      existing.description !== description ||
      existing.brand !== (brand || null) ||
      existing.category !== category
    ) {
      issue(
        line,
        "reference",
        `même référence que la ligne ${existing.line}, mais titre, description, marque ou catégorie différents`,
      );
      return;
    }
    existing.variants.push(variant);
  });

  for (const product of groups.values()) {
    if (product.variants.length > rules.variantsMax) {
      issue(product.line, "reference", `${rules.variantsMax} variantes au plus par produit`);
      continue;
    }
    const names = new Set<string>();
    for (const variant of product.variants) {
      if (product.variants.length > 1 && !variant.name) {
        issue(variant.line, "variante", "nom obligatoire quand le produit a plusieurs variantes");
        continue;
      }
      const key = variant.name.toLowerCase();
      if (names.has(key)) issue(variant.line, "variante", "variante en double dans ce produit");
      names.add(key);
    }
  }
  return done([...groups.values()], rows.length);
}
