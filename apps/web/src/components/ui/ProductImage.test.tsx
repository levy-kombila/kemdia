import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductImage } from "./ProductImage";

afterEach(() => {
  document.head.querySelectorAll('link[rel="preload"]').forEach((l) => l.remove());
});

describe("<ProductImage /> (S8-T04 : simple <img>, plus de composant à hydrater)", () => {
  it("photo du catalogue : adresses de l'optimiseur et tailles (srcset), chargement différé", () => {
    const { container } = render(
      <ProductImage src="/images/products/sac.jpg" alt="Sac" width={200} height={200} />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("Sac");
    expect(img.getAttribute("src")).toMatch(
      /^\/_next\/image\?url=%2Fimages%2Fproducts%2Fsac\.jpg&w=\d+&q=75$/,
    );
    expect(img.getAttribute("srcset")).toContain("/_next/image?url=%2Fimages%2Fproducts%2Fsac.jpg");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(document.head.querySelector('link[rel="preload"]')).toBeNull();
  });

  it("photo de vendeur : vignette de 480 px servie telle quelle, jamais par l'optimiseur", () => {
    const src = "/images/v/0b0e8a8e-6c1a-4c55-9b7e-2a3f4d5e6f70.webp";
    const { container } = render(<ProductImage src={src} alt="" fill sizes="40vw" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(src.replace(/\.webp$/, "-480.webp"));
    expect(img.hasAttribute("srcset")).toBe(false);
    // `fill` : l'image remplit son conteneur positionné, comme avec <Image fill>
    expect(img.style.position).toBe("absolute");
    expect(img.style.width).toBe("100%");
  });

  it("grande photo de vendeur (fiche produit) : l'image d'origine", () => {
    const src = "/images/v/0b0e8a8e-6c1a-4c55-9b7e-2a3f4d5e6f70.webp";
    const { container } = render(
      <ProductImage src={src} alt="" size="large" width={800} height={800} />,
    );
    expect(container.querySelector("img")!.getAttribute("src")).toBe(src);
  });

  it("image à précharger : chargement immédiat et <link rel=preload> avec les mêmes tailles", () => {
    const { container } = render(
      <ProductImage src="/images/products/banniere.jpg" alt="" fill sizes="100vw" preload />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).not.toBe("lazy");
    const link = document.head.querySelector('link[rel="preload"][as="image"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute("imagesrcset")).toBe(img.getAttribute("srcset"));
    expect(link!.getAttribute("imagesizes")).toBe("100vw");
  });
});
