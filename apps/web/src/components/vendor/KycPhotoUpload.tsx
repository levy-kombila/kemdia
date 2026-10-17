"use client";

import { Camera, CheckCircle2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ChangeEvent } from "react";
import { FormAlert } from "@/components/ui/Field";
import { reduce } from "./PhotoUploader";

/**
 * Une photo du dossier de vérification (S6-T08) : réduite dans le navigateur comme les photos de produits, envoyée au
 * relais du site (`POST /vendeur/verification/photos/{sorte}`). L'API la réencode puis la CHIFFRE ; personne d'autre
 * que l'équipe Kemdia ne la revoit, pas même le vendeur.
 */
export function KycPhotoUpload({
  kind,
  label,
  received,
}: {
  kind: "id_front" | "id_back" | "rccm";
  label: string;
  received: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setProblem(null);
    const reduced = await reduce(file);
    if ("error" in reduced) {
      setProblem(reduced.error);
      setBusy(false);
      return;
    }
    const response = await fetch(`/vendeur/verification/photos/${kind}`, {
      method: "POST",
      headers: { "content-type": reduced.blob.type || "application/octet-stream" },
      body: reduced.blob,
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as
      { ok: true } | { ok: false; message: string } | null;
    setBusy(false);
    if (body?.ok) {
      router.push("/vendeur/verification?ok=photo-kyc");
      router.refresh();
      return;
    }
    setProblem(body?.message ?? "Service momentanément indisponible, réessayez dans un instant.");
  };

  return (
    <div className="border-ink-100 space-y-2 rounded-lg border p-3">
      <p className="flex items-center gap-2 font-semibold">
        {received ? (
          <CheckCircle2 className="text-success-600 size-5" aria-hidden />
        ) : (
          <Camera className="text-ink-400 size-5" aria-hidden />
        )}
        {label}
        <span className="text-ink-500 text-sm font-normal">
          {received ? "— reçue" : "— à envoyer"}
        </span>
      </p>
      <label
        htmlFor={inputId}
        className={
          busy
            ? "bg-ink-200 text-ink-500 inline-flex cursor-wait items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            : "border-ink-200 hover:bg-ink-50 inline-flex cursor-pointer items-center gap-2 rounded-full border-2 bg-white px-4 py-2 text-sm font-semibold focus-within:ring-4"
        }
      >
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {received ? "Remplacer la photo" : "Prendre ou choisir la photo"}
        <span className="sr-only"> : {label}</span>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={upload}
          className="sr-only"
        />
      </label>
      {problem && <FormAlert>{problem}</FormAlert>}
    </div>
  );
}
