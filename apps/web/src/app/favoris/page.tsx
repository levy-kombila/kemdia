import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { FavoritesView } from "./FavoritesView";

export const metadata: Metadata = { title: "Mes favoris", robots: { index: false } };

export default function FavoritesPage() {
  return (
    <div className="container-page space-y-3 py-4">
      <Breadcrumbs items={[{ label: "Favoris" }]} />
      <FavoritesView />
    </div>
  );
}
