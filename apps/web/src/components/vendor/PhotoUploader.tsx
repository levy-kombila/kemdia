"use client";

import { ImagePlus, LoaderCircle } from "lucide-react";
import { useId, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/ui/Field";
import { MAX_UPLOAD_BYTES, MIN_SIDE, REDUCED_SIDE } from "@/lib/vendor/images";

/** Une photo déjà légère et petite part telle quelle (pas de perte de qualité inutile). */
const KEEP_BELOW_BYTES = 1_500_000;
const JPEG_QUALITY = 0.85;

export type Reduced = { blob: Blob } | { error: string };

/**
 * Réduit une photo dans le navigateur (S6-T06, ADR-0037) : 1 600 px au plus (la taille de la grande image de l'API),
 * JPEG de qualité 85, sens de la photo appliqué. Une photo de téléphone de 3 à 8 Mo passe à quelques centaines de Ko :
 * l'envoi est rapide en 3G et n'atteint plus la limite de 5 Mo. Une photo redessinée sur le canevas perd ses
 * métadonnées (position GPS) ; une petite photo envoyée telle quelle les garde jusqu'à l'API, qui réencode TOUJOURS
 * sans aucune métadonnée (ADR-0035) : rien n'est jamais publié.
 */
export async function reduce(file: File): Promise<Reduced> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(
    () => null,
  );
  if (!bitmap) {
    // Format que ce navigateur ne sait pas lire : l'API tranchera (si la taille le permet)
    return file.size <= MAX_UPLOAD_BYTES
      ? { blob: file }
      : { error: "Photo trop lourde (5 Mo au plus) et illisible par ce navigateur." };
  }
  const { width, height } = bitmap;
  if (Math.min(width, height) < MIN_SIDE) {
    bitmap.close();
    return { error: `Photo trop petite : ${MIN_SIDE} pixels au moins de chaque côté.` };
  }
  const scale = Math.min(1, REDUCED_SIDE / Math.max(width, height));
  const known = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (scale === 1 && known && file.size <= KEEP_BELOW_BYTES) {
    bitmap.close();
    return { blob: file };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file.size <= MAX_UPLOAD_BYTES ? { blob: file } : { error: "Photo trop lourde." };
  }
  // Fond blanc : un PNG transparent ne devient pas noir en JPEG
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return { error: "La photo n'a pas pu être préparée. Essayez une autre photo." };
  return blob.size <= MAX_UPLOAD_BYTES ? { blob } : { error: "Photo trop lourde (5 Mo au plus)." };
}

/**
 * Ajout de photos à un produit (S6-T06) : choix d'une ou plusieurs photos, réduction, envoi une par une au relais du
 * site (`POST /vendeur/produits/{id}/photos`). Chaque photo ajoutée renvoie le produit en modération.
 */
export function PhotoUploader({ productId, remaining }: { productId: string; remaining: number }) {
  const router = useRouter();
  const inputId = useId();
  const [status, setStatus] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0 || busy) return;
    const chosen = files.slice(0, remaining);
    const issues: string[] = [];
    if (files.length > remaining)
      issues.push(
        `${files.length - remaining} photo(s) non envoyée(s) : 10 photos au plus par produit.`,
      );
    setBusy(true);
    setProblems([]);
    let sent = 0;
    for (const [index, file] of chosen.entries()) {
      const label = chosen.length > 1 ? `Photo ${index + 1}` : "Photo";
      setStatus(`${label} : préparation…`);
      const reduced = await reduce(file);
      if ("error" in reduced) {
        issues.push(`${label} : ${reduced.error}`);
        continue;
      }
      setStatus(`${label} : envoi…`);
      const response = await fetch(`/vendeur/produits/${productId}/photos`, {
        method: "POST",
        headers: { "content-type": reduced.blob.type || "application/octet-stream" },
        body: reduced.blob,
      }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as
        { ok: true } | { ok: false; message: string; signedOut?: boolean } | null;
      if (body?.ok) {
        sent += 1;
        continue;
      }
      issues.push(
        `${label} : ${body?.message ?? "service momentanément indisponible, réessayez dans un instant."}`,
      );
      // Session perdue : inutile d'envoyer les suivantes
      if (body && !body.ok && body.signedOut) break;
    }
    setStatus(null);
    if (sent > 0 && issues.length === 0) {
      // Même page, nouvelle version lue sur le serveur : le composant reste monté, on le libère
      router.push(`/vendeur/produits/${productId}?ok=photo-ajoutee`);
      router.refresh();
      setBusy(false);
      return;
    }
    setBusy(false);
    setProblems(sent > 0 ? [...issues, `${sent} photo(s) ajoutée(s).`] : issues);
    // Photos ajoutées malgré une erreur (ou ajout incertain après un délai dépassé) : la liste est relue sur le serveur
    router.refresh();
  };

  if (remaining <= 0)
    return (
      <p className="text-ink-500 text-sm">
        10 photos au plus : retirez-en une pour en ajouter une autre.
      </p>
    );

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        className={
          busy
            ? "bg-ink-200 text-ink-500 inline-flex cursor-wait items-center gap-2 rounded-full px-5 py-3 font-semibold"
            : "bg-brand-600 hover:bg-brand-700 inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-3 font-semibold text-white focus-within:ring-4"
        }
      >
        {busy ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden />
        ) : (
          <ImagePlus className="size-5" aria-hidden />
        )}
        Ajouter des photos
        <input
          id={inputId}
          type="file"
          // Types listés : un iPhone convertit alors ses photos HEIC en JPEG au moment du choix
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={upload}
          className="sr-only"
        />
      </label>
      <p className="text-ink-500 text-sm">
        JPEG, PNG ou WebP, {remaining} encore possible(s). Les photos sont réduites sur votre
        téléphone avant l&apos;envoi.
      </p>
      <p role="status" aria-live="polite" className="text-sm font-semibold">
        {status}
      </p>
      {problems.length > 0 && (
        <FormAlert>
          <ul className="list-disc space-y-1 pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </FormAlert>
      )}
    </div>
  );
}
