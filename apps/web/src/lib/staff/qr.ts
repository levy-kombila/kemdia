import "server-only";
import { encode } from "uqr";

/** QR code prêt à dessiner : un carré de `size` modules et un tracé SVG fait seulement de chiffres et de M, h, v, z. */
export type QrDrawing = { size: number; path: string };

/** Marge blanche autour du code, en modules (4 recommandés par la norme ; 2 suffisent sur un fond blanc). */
const BORDER = 2;

/**
 * Dessin du QR code de la double authentification (S6-T05, ADR-0036), calculé SUR LE SERVEUR : le navigateur ne
 * reçoit ni bibliothèque ni code, seulement un tracé (une suite de rectangles). Correction d'erreur « M » (15 %) :
 * lisible sur un écran un peu sale ou mal éclairé. Le tracé n'est jamais du HTML : il va dans l'attribut `d` d'un
 * `<path>` rendu par React, sans `dangerouslySetInnerHTML`.
 */
export function qrDrawing(text: string): QrDrawing {
  const qr = encode(text, { ecc: "M", border: BORDER });
  const parts: string[] = [];
  qr.data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      // Une rangée de modules noirs consécutifs = un seul rectangle
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return { size: qr.size, path: parts.join("") };
}
