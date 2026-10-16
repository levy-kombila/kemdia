import { ChevronRight, Store, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell } from "@/components/staff/StaffShell";
import { formatTime } from "@/lib/format";
import { isAdmin } from "@/lib/staff/roles";
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

const counted = (page: { items: unknown[]; nextCursor: string | null }) =>
  page.nextCursor ? `${COUNT_LIMIT}+` : String(page.items.length);

/** Tableau de bord de l'équipe (S6-T05) : ce qui attend une décision. */
export default async function StaffHomePage() {
  const { account, token, factor } = await requireVerifiedStaff("/equipe");
  const admin = isAdmin(account.roles);
  const api = staffApi();
  const [products, shops] = await Promise.all([
    api.moderationQueue(token, { status: "pending", limit: COUNT_LIMIT }),
    admin ? api.shops(token, { status: "pending", limit: COUNT_LIMIT }) : null,
  ]);

  return (
    <StaffShell section="accueil" admin={admin} title={`Bonjour ${account.firstName}`}>
      <p className="text-ink-500 text-sm">
        Session confirmée jusqu&apos;à{" "}
        {factor.verifiedUntil ? formatTime(factor.verifiedUntil) : "—"}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Counter
          href="/equipe/moderation"
          icon={Tags}
          label="produits à modérer"
          count={products.ok ? counted(products.data) : null}
        />
        {shops && (
          <Counter
            href="/equipe/boutiques"
            icon={Store}
            label="demandes de boutique à examiner"
            count={shops.ok ? counted(shops.data) : null}
          />
        )}
      </div>
      {(!products.ok || (shops && !shops.ok)) && (
        <p className="text-ink-500 text-sm">
          « — » : nombre momentanément indisponible. Rechargez la page dans un instant.
        </p>
      )}
    </StaffShell>
  );
}
