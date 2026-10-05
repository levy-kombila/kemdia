// Archivo à largeur variable : texte en largeur normale, titres élargis, prix condensés (étiquette de marché)
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Providers } from "@/components/providers/Providers";
import { SITE, siteUrl } from "@/lib/site";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: `${SITE.name} — ${SITE.tagline}`,
      template: `%s | ${SITE.name}`,
    },
    description: SITE.description,
    applicationName: SITE.name,
    keywords: [
      "e-commerce Gabon",
      "boutique en ligne Libreville",
      "Mobile Money",
      "livraison Gabon",
      "Kemdia",
    ],
    openGraph: {
      type: "website",
      locale: SITE.locale,
      siteName: SITE.name,
      title: `${SITE.name} — ${SITE.tagline}`,
      description: SITE.description,
    },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#d61f2c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr-GA">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#contenu"
          className="sr-only z-[100] rounded-lg bg-white px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
        >
          Aller au contenu
        </a>
        <Providers>
          <Header />
          <main id="contenu" className="flex-1 pb-16 lg:pb-0">
            {children}
          </main>
          <Footer />
          <MobileTabBar />
        </Providers>
      </body>
    </html>
  );
}
