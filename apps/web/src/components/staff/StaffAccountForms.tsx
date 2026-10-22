import {
  ADMIN_ASSIGNABLE_ROLES,
  ROLE_LABELS,
  STAFF_LIMITS,
  type Role,
} from "@kemdia/contracts/constants";
import { Check, Plus, UserMinus, UserX, UserCheck } from "lucide-react";
import { setStaffRoleAction, staffAccountAction } from "@/lib/staff/actions";

/**
 * Formulaires de l'écran Utilisateurs (S7.5-T04, ADR-0051) : simples formulaires HTML envoyés à une action serveur
 * (aucun état : utilisables par une page serveur comme par la recherche). L'action ET l'API revérifient tout : jamais
 * « admin » (commande serveur seulement), jamais sur soi-même, jamais sur un administrateur.
 */

/** Rôles de l'équipe qu'un administrateur accorde ici (« vendeur » passe par la demande de boutique). */
const TEAM_ROLES = ADMIN_ASSIGNABLE_ROLES.filter((role) => role !== "vendor");

const SMALL =
  "inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-sm font-semibold";
const CONFIRM_LABEL = "text-ink-700 flex items-center gap-2 text-sm";

function Hidden({ accountId, ...rest }: { accountId: string } & Record<string, string>) {
  return (
    <>
      <input type="hidden" name="accountId" value={accountId} />
      {Object.entries(rest).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

/** Un bouton par rôle : coché = le compte l'a (cliquer le retire), sinon cliquer l'accorde. */
export function RoleToggles({ accountId, roles }: { accountId: string; roles: readonly Role[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Rôles de l'équipe">
      {TEAM_ROLES.map((role) => {
        const has = roles.includes(role);
        return (
          <li key={role}>
            <form action={setStaffRoleAction}>
              <Hidden accountId={accountId} role={role} grant={has ? "0" : "1"} />
              <button
                type="submit"
                aria-pressed={has}
                title={
                  has
                    ? `Retirer le rôle ${ROLE_LABELS[role]}`
                    : `Accorder le rôle ${ROLE_LABELS[role]}`
                }
                className={
                  has
                    ? `${SMALL} border-brand-600 bg-brand-600 text-white`
                    : `${SMALL} border-ink-200 hover:bg-ink-50 bg-white`
                }
              >
                {has ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Plus className="size-4" aria-hidden />
                )}
                {ROLE_LABELS[role]}
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}

/** « Retirer ses rôles » : départ d'un employé, sessions fermées ; case « Je confirme » obligatoire. */
export function RemoveStaffForm({ accountId }: { accountId: string }) {
  return (
    <details className="border-ink-200 rounded-xl border-2 bg-white">
      <summary className="text-brand-700 flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-semibold">
        <UserMinus className="size-4" aria-hidden /> Retirer ses rôles…
      </summary>
      <form action={staffAccountAction} className="space-y-2 px-4 pb-4">
        <Hidden accountId={accountId} action="remove-staff" />
        <p className="text-sm">
          Tous ses rôles de l&apos;équipe sont retirés et ses sessions fermées tout de suite. Il
          garde son compte client (et sa boutique s&apos;il en a une).
        </p>
        <label className={CONFIRM_LABEL}>
          <input type="checkbox" name="confirme" value="oui" required className="size-4" /> Je
          confirme
        </label>
        <button
          type="submit"
          className="bg-brand-600 rounded-full px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Retirer ses rôles
        </button>
      </form>
    </details>
  );
}

/** « Désactiver le compte » : plus aucune connexion ; motif (gardé au journal) et case « Je confirme » obligatoires. */
export function DisableAccountForm({ accountId }: { accountId: string }) {
  return (
    <details className="border-ink-200 rounded-xl border-2 bg-white">
      <summary className="text-brand-700 flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-semibold">
        <UserX className="size-4" aria-hidden /> Désactiver le compte…
      </summary>
      <form action={staffAccountAction} className="space-y-2 px-4 pb-4">
        <Hidden accountId={accountId} action="disable" />
        <label className="block">
          <span className="text-ink-800 mb-1 block text-sm font-semibold">Motif</span>
          <input
            name="reason"
            required
            minLength={STAFF_LIMITS.reasonMin}
            maxLength={STAFF_LIMITS.reasonMax}
            className="border-ink-200 focus:border-brand-600 w-full rounded-xl border bg-white px-3 py-2 outline-none"
          />
          <span className="text-ink-500 mt-1 block text-xs">
            {STAFF_LIMITS.reasonMin} à {STAFF_LIMITS.reasonMax} caractères, gardés au journal.
          </span>
        </label>
        <label className={CONFIRM_LABEL}>
          <input type="checkbox" name="confirme" value="oui" required className="size-4" /> Je
          confirme
        </label>
        <button
          type="submit"
          className="bg-brand-600 rounded-full px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Désactiver le compte
        </button>
      </form>
    </details>
  );
}

export function EnableAccountForm({ accountId }: { accountId: string }) {
  return (
    <form action={staffAccountAction}>
      <Hidden accountId={accountId} action="enable" />
      <button
        type="submit"
        className={`${SMALL} border-forest-700 text-forest-700 hover:bg-forest-50 bg-white`}
      >
        <UserCheck className="size-4" aria-hidden /> Réactiver le compte
      </button>
    </form>
  );
}
