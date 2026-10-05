import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/CheckoutFlow";

export const metadata: Metadata = { title: "Commande", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="container-page py-4">
      <CheckoutFlow />
    </div>
  );
}
