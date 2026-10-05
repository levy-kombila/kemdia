import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CartView } from "./CartView";

export const metadata: Metadata = { title: "Mon panier", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Panier" }]} />
      <h1 className="mb-6 text-3xl font-extrabold">Mon panier</h1>
      <CartView />
    </div>
  );
}
