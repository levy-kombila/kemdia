import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductThumb, staffThumbSrc } from "./ProductThumb";

describe("vignettes des listes de l'équipe (S9-T02)", () => {
  it("adresse : vignette publique si la fiche est publiée, sinon relais ; jamais un autre site", () => {
    const relay = (path: string) => (path.startsWith("/images/v/") ? "/equipe/relais" : null);
    const draft = { published: false, relay };
    const live = { published: true, relay };
    expect(staffThumbSrc("/images/v/11111111-2222-4333-8444-555555555555.webp", draft)).toBe(
      "/equipe/relais",
    );
    expect(staffThumbSrc("/images/v/11111111-2222-4333-8444-555555555555.webp", live)).toBe(
      "/images/v/11111111-2222-4333-8444-555555555555-480.webp",
    );
    expect(staffThumbSrc("/images/products/telephone.webp", draft)).toBe(
      "/images/products/telephone.webp",
    );
    // Photo de vendeur sans relais possible : rien plutôt qu'une image cassée
    expect(
      staffThumbSrc("/images/v/11111111-2222-4333-8444-555555555555.webp", {
        published: false,
        relay: () => null,
      }),
    ).toBeNull();
    for (const bad of [
      "https://exemple.com/x.webp",
      "//exemple.com/x",
      "javascript:alert(1)",
      "/images/../api/secret",
    ])
      expect(staffThumbSrc(bad, live)).toBeNull();
    expect(staffThumbSrc(null, live)).toBeNull();
  });

  it("affiche la photo, ou « sans photo »", () => {
    const { container, rerender } = render(<ProductThumb src="/images/products/telephone.webp" />);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/images/products/telephone.webp",
    );
    rerender(<ProductThumb src={null} />);
    expect(screen.getByLabelText("Sans photo")).toBeInTheDocument();
  });
});
