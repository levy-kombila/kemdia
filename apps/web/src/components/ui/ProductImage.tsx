import Image, { type ImageProps } from "next/image";
import { isVendorImage, vendorThumbnail } from "@/lib/catalog/vendor-image";

type Props = Omit<ImageProps, "src"> & {
  src: string;
  /** Photo de vendeur : vignette de 480 px (listes, panier) ou grande image (fiche produit). */
  size?: "small" | "large";
};

/**
 * Image d'un produit (S6-T04, ADR-0035). Photos du catalogue Kemdia : optimiseur de Next.js, comme avant. Photos des
 * vendeurs (« /images/v/… ») : déjà réencodées en WebP aux bonnes tailles par l'API, servies telles quelles par le
 * relais du site, jamais par l'optimiseur (il les garderait 24 h, même retirées ou cachées par la modération).
 */
export function ProductImage({ src, alt, size = "small", unoptimized, ...props }: Props) {
  const vendor = isVendorImage(src);
  return (
    <Image
      {...props}
      alt={alt}
      src={vendor && size === "small" ? vendorThumbnail(src) : src}
      unoptimized={vendor || unoptimized}
    />
  );
}
