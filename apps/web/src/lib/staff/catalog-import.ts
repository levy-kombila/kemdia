import { CATALOG_IMPORT_LIMITS } from "@kemdia/contracts/constants";

/**
 * Fichier du catalogue (S8-T03) : texte UTF-8 (Google Sheets, « CSV UTF-8 » d'Excel) ou Windows-1252 (« CSV
 * séparateur point-virgule » d'Excel en français, accents compris). `null` : pas un fichier texte (octet nul).
 */
export function decodeCatalogFile(bytes: Uint8Array): string | null {
  if (bytes.length === 0 || bytes.length > CATALOG_IMPORT_LIMITS.maxBytes) return null;
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export const isImportMode = (value: unknown): value is "check" | "import" =>
  value === "check" || value === "import";
