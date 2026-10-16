import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ROLE_LABELS, type Role } from "@kemdia/contracts/constants";

/** Rôles du compte (S4-T06). Équipe : lien vers son espace (S6-T05), protégé par la double authentification. */
export function RoleList({ roles }: { roles: readonly Role[] }) {
  const team = roles.includes("admin") || roles.includes("moderator");
  return (
    <div className="mt-4">
      <h2 className="text-ink-500 text-xs font-semibold uppercase tracking-wide">Vos rôles</h2>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label="Vos rôles">
        {roles.map((role) => (
          <li
            key={role}
            className="bg-brand-50 text-brand-700 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold"
          >
            {role !== "client" && <ShieldCheck className="size-4" aria-hidden />}
            {ROLE_LABELS[role]}
          </li>
        ))}
      </ul>
      {team && (
        <Link
          href="/equipe"
          className="bg-ink-900 hover:bg-ink-800 mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
        >
          <ShieldCheck className="size-4" aria-hidden /> Ouvrir l&apos;espace de l&apos;équipe
        </Link>
      )}
    </div>
  );
}
