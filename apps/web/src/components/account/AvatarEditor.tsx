"use client";

import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ChangeEvent } from "react";
import { reduce } from "@/components/vendor/PhotoUploader";
import { FormAlert } from "@/components/ui/Field";
import { refreshSessionAction } from "@/lib/auth/actions";
import { Avatar } from "./Avatar";

/**
 * Photo de profil dans « Mon compte » (S7.5-T08, ADR-0055) : choisir une photo (réduite dans le navigateur, recadrée en
 * carré par l'API, sans métadonnées) ou la retirer. Visible seulement par le titulaire du compte.
 */
export function AvatarEditor({
  firstName,
  lastName,
  version,
}: {
  firstName: string;
  lastName: string;
  version: string | null;
}) {
  const router = useRouter();
  const inputId = useId();
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const done = async (response: Response | null, ok: string) => {
    const body = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
    } | null;
    setPending(null);
    if (response?.ok && body?.ok) {
      setMessage({ tone: "info", text: ok });
      // Mémoire des sessions des pages oubliée AVANT de les redemander : la nouvelle photo s'affiche tout de suite
      await refreshSessionAction().catch(() => undefined);
      router.refresh();
      return;
    }
    setMessage({
      tone: "error",
      text:
        body?.message ?? "Service momentanément indisponible. Réessayez dans quelques instants.",
    });
  };

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || pending) return;
    setMessage(null);
    setPending("upload");
    const reduced = await reduce(file);
    if ("error" in reduced) {
      setPending(null);
      return setMessage({ tone: "error", text: reduced.error });
    }
    const response = await fetch("/compte/photo", {
      method: "POST",
      headers: { "content-type": reduced.blob.type || "application/octet-stream" },
      body: reduced.blob,
    }).catch(() => null);
    await done(response, "Photo de profil enregistrée.");
  };

  const remove = async () => {
    if (pending) return;
    setMessage(null);
    setPending("remove");
    const response = await fetch("/compte/photo", { method: "DELETE" }).catch(() => null);
    await done(response, "Photo retirée : vos initiales s'affichent à la place.");
  };

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <Avatar firstName={firstName} lastName={lastName} version={version} size={72} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label
          htmlFor={inputId}
          className="text-brand-700 hover:bg-brand-50 inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 font-semibold underline focus-within:ring-4"
        >
          {pending === "upload" ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-4" aria-hidden />
          )}
          {version ? "Changer la photo" : "Ajouter une photo"}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={pending !== null}
            onChange={choose}
          />
        </label>
        {version && (
          <button
            type="button"
            onClick={remove}
            disabled={pending !== null}
            className="text-ink-600 hover:bg-ink-50 inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold underline"
          >
            {pending === "remove" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            Retirer
          </button>
        )}
      </div>
      <p className="text-ink-500 text-xs">Visible seulement par vous. JPEG, PNG ou WebP.</p>
      {message && (
        <div className="w-full">
          {message.tone === "error" ? (
            <FormAlert>{message.text}</FormAlert>
          ) : (
            <FormAlert tone="info">{message.text}</FormAlert>
          )}
        </div>
      )}
    </div>
  );
}
