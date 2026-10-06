import { ImageResponse } from "next/og";
import { getProduct } from "@/lib/catalog";
import { discountPercent } from "@/lib/format";
import { ogAmount, ogFonts, publicImageAsPng } from "@/lib/og-image";

// Aperçu affiché quand on partage un produit sur WhatsApp, Facebook… (1200 × 630, format recommandé)
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Produit Kemdia : photo, prix et livraison au Gabon";

// Généré à la demande (le catalogue n'est jamais lu pendant la construction, S3-T05).
// WhatsApp et Facebook gardent l'aperçu en cache de leur côté : il n'est calculé qu'au premier partage.

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProduct((await params).slug);
  const photo = await publicImageAsPng(product?.images[0], 520);
  const discount = product ? discountPercent(product.price, product.compareAtPrice) : null;
  const title = product?.title ?? "Kemdia";
  const amount = product ? ogAmount(product.price) : "";

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#eef0f3",
        padding: 40,
        gap: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 550,
          height: 550,
          background: "#ffffff",
          borderRadius: 32,
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {photo && (
          <img src={photo} width={500} height={500} alt="" style={{ objectFit: "contain" }} />
        )}
        {discount && (
          <div
            style={{
              position: "absolute",
              top: 28,
              left: 28,
              background: "#ffc629",
              color: "#14181e",
              fontSize: 44,
              fontWeight: 800,
              padding: "6px 18px",
              borderRadius: 12,
              transform: "rotate(-4deg)",
            }}
          >
            {`-${discount} %`}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              width: 60,
              height: 60,
              background: "#d61f2c",
              borderRadius: 14,
              color: "#fff",
              fontSize: 40,
              fontWeight: 800,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            K
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#14181e" }}>
            Kem<span style={{ color: "#d61f2c" }}>dia</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: title.length > 40 ? 46 : 54,
            fontWeight: 600,
            color: "#14181e",
            lineHeight: 1.15,
          }}
        >
          {title}
        </div>
        {product && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 28 }}>
            <span style={{ fontSize: 84, fontWeight: 800, color: "#14181e", letterSpacing: -2 }}>
              {amount}
            </span>
            <span style={{ fontSize: 34, fontWeight: 600, color: "#14181e" }}>FCFA</span>
          </div>
        )}
        {product?.compareAtPrice && product.compareAtPrice > product.price && (
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#636b78",
              textDecoration: "line-through",
            }}
          >
            {`${ogAmount(product.compareAtPrice)} FCFA`}
          </div>
        )}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: 28,
            color: "#0b7a4b",
            fontWeight: 600,
          }}
        >
          Livraison partout au Gabon
        </div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 26, color: "#333a45" }}>
          Airtel Money · Moov Money · à la livraison
        </div>
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  );
}
