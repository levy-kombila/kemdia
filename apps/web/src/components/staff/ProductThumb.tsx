import { ImageOff } from "lucide-react";
import { vendorThumbnail } from "@/lib/catalog/vendor-image";
import { cn } from "@/lib/cn";

/**
 * Vignette d'un produit dans les listes de l'équipe (S9-T02) : la première photo, ou une icône « sans photo ». Simple
 * `<img>` (jamais l'optimiseur de Next.js : les photos de vendeur pas encore publiées passent par le relais de
 * l'équipe, ADR-0035). `src` est toujours construite par le site (relais ou chemin public du catalogue).
 */
export function ProductThumb({ src, size = "md" }: { src: string | null; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "border-ink-100 bg-ink-50 flex shrink-0 items-center justify-center overflow-hidden rounded-lg border",
        size === "sm" ? "size-12" : "size-16",
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ImageOff className="text-ink-400 size-6" aria-label="Sans photo" />
      )}
    </span>
  );
}

/**
 * Adresse d'affichage d'une photo de produit pour l'équipe : fiche publiée → vignette publique (480 px, comme le site) ;
 * sinon relais de l'équipe (photo de vendeur pas encore publiée) ; chemin public pour une photo du catalogue Kemdia ;
 * `null` pour toute autre valeur (jamais une adresse reçue telle quelle vers un autre site).
 */
export function staffThumbSrc(
  path: string | null | undefined,
  options: { published: boolean; relay: (path: string) => string | null },
): string | null {
  if (!path || !/^\/images\/[A-Za-z0-9/_.-]+$/.test(path) || path.includes("..")) return null;
  // Relecture S9-T02 : la vignette publique est petite et ne compte pas dans les limites de l'équipe
  if (options.published) return vendorThumbnail(path);
  return options.relay(path) ?? (path.startsWith("/images/v/") ? null : path);
}
