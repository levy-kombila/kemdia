import { ImageResponse } from "next/og";
import { getBestsellers } from "@/lib/catalog";
import { ogFonts, publicImageAsPng } from "@/lib/og-image";

// Aperçu du site (accueil et pages sans aperçu propre) quand on partage kemdia.ga
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Kemdia, le shopping en ligne livré partout au Gabon";

export default async function Image() {
  const photos = (
    await Promise.all(getBestsellers(6).map((p) => publicImageAsPng(p.images[0], 200)))
  ).filter((p): p is string => p !== null);
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#d61f2c",
        padding: 56,
        color: "#fff",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 600 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              width: 72,
              height: 72,
              background: "#fff",
              color: "#d61f2c",
              borderRadius: 16,
              fontSize: 48,
              fontWeight: 800,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            K
          </div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 800 }}>Kemdia</div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.05,
          }}
        >
          Le shopping en ligne, livré partout au Gabon
        </div>
        <div style={{ display: "flex", marginTop: "auto", gap: 12, fontSize: 26, fontWeight: 600 }}>
          {[
            ["Airtel Money", "#ffffff"],
            ["Moov Money", "#ffffff"],
            ["Livraison 24–48 h", "#ffc629"],
          ].map(([label, bg]) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                height: 56,
                padding: "0 22px",
                flexShrink: 0,
                whiteSpace: "nowrap",
                borderRadius: 999,
                background: bg,
                color: "#14181e",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          width: 470,
          marginLeft: "auto",
          transform: "rotate(-5deg)",
        }}
      >
        {photos.map((src, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              width: 140,
              height: 140,
              background: "#fff",
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img src={src} width={120} height={120} alt="" />
          </div>
        ))}
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  );
}
