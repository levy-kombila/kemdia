import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Charge une image du dossier public/ et la convertit en PNG (data URL) pour le générateur d'aperçus,
 * qui ne lit pas le WebP. Seuls les chemins « /images/… » sans « .. » sont acceptés.
 */
export async function publicImageAsPng(
  src: string | undefined,
  size: number,
): Promise<string | null> {
  if (!src || !src.startsWith("/images/") || src.includes("..")) return null;
  try {
    const file = await readFile(path.join(process.cwd(), "public", src));
    const png = await sharp(file)
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Polices Archivo (graisses 600 et 800) pour les aperçus. Le générateur ne lit pas le WOFF2 ni les polices variables :
 * on lit les fichiers WOFF statiques du paquet @fontsource/archivo (dépendance de construction).
 * Les aperçus sont générés à la construction de l'image Docker, où ce paquet est présent.
 */
export async function ogFonts() {
  const dir = path.join(process.cwd(), "node_modules/@fontsource/archivo/files");
  try {
    const [semi, bold] = await Promise.all([
      readFile(path.join(dir, "archivo-latin-600-normal.woff")),
      readFile(path.join(dir, "archivo-latin-800-normal.woff")),
    ]);
    return [
      { name: "Archivo", data: semi, weight: 600 as const, style: "normal" as const },
      { name: "Archivo", data: bold, weight: 800 as const, style: "normal" as const },
    ];
  } catch {
    return undefined; // police par défaut du générateur
  }
}

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
/** 148000 → « 148 000 » avec des espaces ordinaires (le générateur affiche mal les espaces fines). */
export const ogAmount = (n: number) => nf.format(Math.round(n)).replace(/\s/g, " ");
