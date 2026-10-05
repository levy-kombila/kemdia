"use client";

import { Link2, Share2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { whatsappShareUrl } from "@/lib/share";

function WhatsAppIcon() {
  // Pictogramme de bulle générique (pas le logo officiel)
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1.1 2.7 11.4 11.4 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z" />
    </svg>
  );
}

const noop = () => () => {};

/** Partage : WhatsApp (canal n° 1 au Gabon), partage natif du téléphone, ou copie du lien. */
export function ShareButtons({ url, title, price }: { url: string; title: string; price: number }) {
  const { notify } = useToast();
  // Partage natif du téléphone disponible ? (faux côté serveur, vérifié dans le navigateur)
  const canShare = useSyncExternalStore(
    noop,
    () => typeof navigator.share === "function",
    () => false,
  );

  async function shareOrCopy() {
    try {
      if (canShare) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      notify("Lien copié");
    } catch {
      /* partage annulé par l'utilisateur */
    }
  }

  return (
    <>
      <a
        href={whatsappShareUrl(url, title, price)}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-forest-700 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white hover:bg-[#064d2f]"
      >
        <WhatsAppIcon /> Partager sur WhatsApp
      </a>
      <button
        type="button"
        onClick={shareOrCopy}
        className="border-ink-200 hover:border-ink-900 inline-flex h-10 items-center gap-2 rounded-full border bg-white px-4 text-sm font-semibold"
      >
        {canShare ? (
          <Share2 className="size-4" aria-hidden />
        ) : (
          <Link2 className="size-4" aria-hidden />
        )}
        {canShare ? "Partager" : "Copier le lien"}
      </button>
    </>
  );
}
