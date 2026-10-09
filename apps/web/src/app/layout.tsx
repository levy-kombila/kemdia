import "./globals.css";

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import { Footer } from "@/components/layout/Footer";
import { Suspense } from "react";
import { Header, HeaderFallback } from "@/components/layout/Header";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Providers } from "@/components/providers/Providers";
import { SITE, siteUrl } from "@/lib/site";

/**
 * Archivo à largeur variable (licence OFL, fichier dans app/fonts) : texte normal, titres élargis, prix condensés.
 * next/font la précharge et calcule une police de secours aux dimensions proches. Les blocs sensibles
 * (cartes produits, barre de tri, titres de liste) ont une hauteur fixe : l'arrivée de la police ne fait
 * rien sauter, même sur Android où la police de secours est différente (budget S2-T08, CLS).
 */
const archivo = localFont({
  src: "./fonts/archivo-latin-wdth.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-archivo",
  adjustFontFallback: "Arial",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // CSP à nonce (S4-T07, ADR-0021) : chaque page est rendue à la demande, avec le nonce de SA requête.
  // Une page pré-générée à la construction n'aurait pas de nonce : ses scripts seraient bloqués.
  await connection();
  return (
    // data-scroll-behavior : défilement doux seulement à l'intérieur d'une page, pas lors d'un changement de page
    <html lang="fr-GA" className={archivo.variable} data-scroll-behavior="smooth">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#contenu"
          className="sr-only z-[100] rounded-lg bg-white px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
        >
          Aller au contenu
        </a>
        <Providers>
          {/* En-tête de réserve envoyé tout de suite si l'API tarde (démo qui se réveille, S4-T08) */}
          <Suspense fallback={<HeaderFallback />}>
            <Header />
          </Suspense>
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
