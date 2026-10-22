import { Banknote, ChevronRight, LifeBuoy, Store, Tags, Truck, Undo2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell } from "@/components/staff/StaffShell";
import { formatTime } from "@/lib/format";
import { hasRole } from "@kemdia/contracts/constants";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Tableau de bord" };

/** Une page entière de la file : au-delà, on affiche « 100+ » (le compte exact n'est pas utile ici). */
const COUNT_LIMIT = 100;

function Counter({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: typeof Store;
  label: string;
  count: string | null;
}) {
  return (
    <Link
      href={href}
      className="hover:ring-brand-100 flex items-center gap-4 rounded-xl bg-white p-5 transition hover:ring-4"
    >
      <span className="bg-brand-50 text-brand-700 flex size-12 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-3xl font-extrabold">{count ?? "—"}</span>
        <span className="text-ink-500 text-sm font-medium">{label}</span>
      </span>
      <ChevronRight className="text-ink-400 size-5" aria-hidden />
    </Link>
  );
}

const SHORTCUT =
  "text-brand-700 hover:bg-brand-50 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold";

/** Liste plafonnée par l'API : « 100+ » quand elle est pleine. */
const listed = (count: number, max: number) => (count >= max ? `${max}+` : String(count));

const counted = (page: { items: unknown[]; nextCursor: string | null }) =>
  page.nextCursor ? `${COUNT_LIMIT}+` : String(page.items.length);

/** Tableau de bord de l'équipe (S6-T05) : ce qui attend une décision. */
export default async function StaffHomePage() {
  const { account, token, factor } = await requireVerifiedStaff("/equipe");
  // Chaque compteur n'est lu que pour le rôle qui l'ouvre (S7.5-T04, ADR-0051)
  const catalog = hasRole(account.roles, "catalog");
  const api = staffApi();
  const finance = hasRole(account.roles, "finance");
  const [products, shops, ready, cash, refunds] = await Promise.all([
    catalog ? api.moderationQueue(token, { status: "pending", limit: COUNT_LIMIT }) : null,
    catalog ? api.shops(token, { status: "pending", limit: COUNT_LIMIT }) : null,
    // Livraisons (S7-T02) : l'API renvoie 100 commandes prêtes au plus
    hasRole(account.roles, "logistics") ? api.readyOrders(token) : null,
    // Finance (S7.5-T05)
    finance ? api.cashToCollect(token) : null,
    finance ? api.refunds(token, "to_do") : null,
  ]);

  return (
    <StaffShell section="accueil" roles={account.roles} title={`Bonjour ${account.firstName}`}>
      <p className="text-ink-500 text-sm">
        Session confirmée jusqu&apos;à{" "}
        {factor.verifiedUntil ? formatTime(factor.verifiedUntil) : "—"}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {products && (
          <Counter
            href="/equipe/moderation"
            icon={Tags}
            label="produits à modérer"
            count={products.ok ? counted(products.data) : null}
          />
        )}
        {shops && (
          <Counter
            href="/equipe/boutiques"
            icon={Store}
            label="demandes de boutique à examiner"
            count={shops.ok ? counted(shops.data) : null}
          />
        )}
        {ready && (
          <Counter
            href="/equipe/livraisons"
            icon={Truck}
            label="commandes à remettre au transporteur"
            count={
              ready.ok
                ? ready.data.items.length >= COUNT_LIMIT
                  ? `${COUNT_LIMIT}+`
                  : String(ready.data.items.length)
                : null
            }
          />
        )}
        {cash && (
          <Counter
            href="/equipe/encaissements"
            icon={Banknote}
            label="commandes en espèces à encaisser"
            count={cash.ok ? listed(cash.data.items.length, 100) : null}
          />
        )}
        {refunds && (
          <Counter
            href="/equipe/remboursements"
            icon={Undo2}
            label="remboursements à faire"
            count={refunds.ok ? listed(refunds.data.items.length, 200) : null}
          />
        )}
      </div>
      {[products, shops, ready, cash, refunds].some((r) => r && !r.ok) && (
        <p className="text-ink-500 text-sm">
          « — » : nombre momentanément indisponible. Rechargez la page dans un instant.
        </p>
      )}
      <ul className="flex flex-wrap gap-2">
        {hasRole(account.roles, "support") && (
          <li>
            <Link href="/equipe/clients" className={SHORTCUT}>
              <LifeBuoy className="size-4" aria-hidden /> Retrouver un client
            </Link>
          </li>
        )}
        {account.roles.includes("admin") && (
          <li>
            <Link href="/equipe/utilisateurs" className={SHORTCUT}>
              <Users className="size-4" aria-hidden /> Gérer l&apos;équipe
            </Link>
          </li>
        )}
      </ul>
    </StaffShell>
  );
}
