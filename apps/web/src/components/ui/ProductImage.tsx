import { getImageProps, type ImageProps } from "next/image";
import { preload as preloadImage } from "react-dom";
import { isVendorImage, vendorThumbnail } from "@/lib/catalog/vendor-image";

type Props = Omit<ImageProps, "src" | "onLoad" | "onError" | "placeholder" | "blurDataURL"> & {
  src: string;
  /** Photo de vendeur : vignette de 480 px (listes, panier) ou grande image (fiche produit). */
  size?: "small" | "large";
};

/**
 * Image d'un produit (S6-T04, ADR-0035). Photos du catalogue Kemdia : optimiseur de Next.js, comme avant. Photos des
 * vendeurs (« /images/v/… ») : déjà réencodées en WebP aux bonnes tailles par l'API, servies telles quelles par le
 * relais du site, jamais par l'optimiseur (il les garderait 24 h, même retirées ou cachées par la modération).
 *
 * Simple balise `<img>` (S8-T04, ADR-0059) : `getImageProps` calcule les mêmes adresses et tailles (`srcset`) que le
 * composant `<Image>` de Next.js, sans composant à rendre interactif dans le navigateur. `<Image>` est un composant
 * « client » : chaque photo (~25 à l'ouverture de l'accueil) était hydratée par React pour rien, aucune n'ayant
 * d'effet de chargement (pas de flou d'attente, pas d'`onLoad`). Une image à précharger (`preload`) l'est comme avant.
 */
export function ProductImage({ src, alt, size = "small", unoptimized, ...props }: Props) {
  const vendor = isVendorImage(src);
  const { props: img } = getImageProps({
    ...props,
    alt,
    src: vendor && size === "small" ? vendorThumbnail(src) : src,
    unoptimized: vendor || unoptimized,
  });
  if (props.preload || props.priority) {
    // Comme <Image preload> : <link rel="preload"> dans l'en-tête du document, avec les mêmes tailles
    preloadImage(img.src, {
      as: "image",
      imageSrcSet: img.srcSet,
      imageSizes: img.sizes,
      ...(img.fetchPriority ? { fetchPriority: img.fetchPriority } : {}),
    });
  }
  // eslint-disable-next-line @next/next/no-img-element -- adresses et tailles calculées par getImageProps (voir plus haut)
  return <img {...img} alt={alt} />;
}
