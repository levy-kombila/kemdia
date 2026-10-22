import type { Metadata } from "next";
import { SupportAccountLookup } from "@/components/staff/AccountLookupForms";
import { StaffShell } from "@/components/staff/StaffShell";
import { requireVerifiedStaff } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Clients" };

/**
 * Service client (S7.5-T04, ADR-0051) : retrouver un compte par e-mail ou téléphone, puis lire ses commandes. Lecture
 * seule ; chaque recherche est inscrite au journal d'audit par l'API.
 */
export default async function SupportClientsPage() {
  const { account } = await requireVerifiedStaff("/equipe/clients", "support");
  return (
    <StaffShell
      section="clients"
      roles={account.roles}
      title="Clients"
      crumbs={[{ label: "Clients" }]}
    >
      <p className="text-ink-500 text-sm">
        Chaque recherche est inscrite au journal, avec votre nom. Ne cherchez un client que pour
        répondre à sa demande.
      </p>
      <SupportAccountLookup />
    </StaffShell>
  );
}
