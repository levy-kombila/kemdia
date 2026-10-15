import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/CheckoutFlow";
import { requireAccount } from "@/lib/orders/orders";

export const metadata: Metadata = { title: "Commande", robots: { index: false } };

/**
 * Tunnel de commande (S5-T07) : compte obligatoire (choix du 2026-10-10). Sans session, retour à la connexion puis
 * ici ; le panier du navigateur rejoint celui du compte à la connexion (S5-T01).
 */
export default async function CheckoutPage() {
  const account = await requireAccount("/commande");
  return (
    <div className="container-page py-4">
      <CheckoutFlow
        account={{ fullName: `${account.firstName} ${account.lastName}`, phone: account.phone }}
      />
    </div>
  );
}
