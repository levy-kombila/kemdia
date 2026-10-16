import { SHOP_LIMITS } from "@kemdia/contracts/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApproveForm, ReasonForm } from "@/components/staff/DecisionForms";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatGabonPhone } from "@/lib/auth/validation";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { decideShopAction } from "@/lib/staff/actions";
import { SHOP_STATUS } from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Boutique" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr]">
      <dt className="text-ink-500 text-sm font-semibold">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Une boutique et les décisions possibles selon son statut (ADR-0032) : à examiner → valider ou refuser ; active →
 * suspendre ; suspendue → réactiver ; refusée → rien (le vendeur peut redemander). La boutique Kemdia : aucune.
 */
export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ shopId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(shopId)) notFound();
  const { token } = await requireVerifiedStaff(`/equipe/boutiques/${shopId}`, "admin");
  const result = await staffApi().shop(token, shopId);
  if (!result.ok && result.code === "BOUTIQUE_INTROUVABLE") notFound();

  const crumbs = [{ label: "Boutiques", href: "/equipe/boutiques" }, { label: "Boutique" }];
  if (!result.ok) {
    return (
      <StaffShell section="boutiques" admin title="Boutique" crumbs={crumbs}>
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      </StaffShell>
    );
  }

  const shop = result.data;
  const hidden = { shopId: shop.id };
  const partner = shop.kind === "partner";
  const reason = { min: SHOP_LIMITS.reasonMin, max: SHOP_LIMITS.reasonMax };

  return (
    <StaffShell
      section="boutiques"
      admin
      title={shop.name}
      crumbs={crumbs}
      notice={staffNotice(first(query.ok))}
      error={staffErrorFromParam(first(query.erreur))}
    >
      <section aria-label="Informations de la boutique" className="rounded-xl bg-white p-6">
        <dl className="divide-ink-100 divide-y">
          <Row label="Statut">
            <StatusBadge tone={SHOP_STATUS[shop.status].tone}>
              {SHOP_STATUS[shop.status].label}
            </StatusBadge>
            {!partner && <span className="text-ink-500 ml-2 text-sm">Boutique de Kemdia</span>}
          </Row>
          <Row label="Ville">{shop.city}</Row>
          <Row label="Mobile">{shop.phone ? formatGabonPhone(shop.phone) : "—"}</Row>
          <Row label="Description">
            <p className="whitespace-pre-line">{shop.description}</p>
          </Row>
          <Row label="Demande">{formatDateTime(shop.submittedAt)}</Row>
          {shop.reviewedAt && (
            <Row label="Dernière décision">{formatDateTime(shop.reviewedAt)}</Row>
          )}
          {shop.statusReason && <Row label="Motif donné">{shop.statusReason}</Row>}
        </dl>
      </section>

      {partner && shop.status === "pending" && (
        <section aria-label="Décision" className="space-y-3">
          <ApproveForm action={decideShopAction} hidden={hidden}>
            Valider la boutique
          </ApproveForm>
          <ReasonForm
            action={decideShopAction}
            hidden={hidden}
            decision="reject"
            label="Motif du refus"
            button="Refuser la demande"
            min={reason.min}
            max={reason.max}
          />
        </section>
      )}
      {partner && shop.status === "active" && (
        <section aria-label="Décision" className="space-y-3">
          <p className="text-ink-700 text-sm">
            Suspendre cache tous les produits de la boutique et retire le rôle vendeur du compte.
          </p>
          <ReasonForm
            action={decideShopAction}
            hidden={hidden}
            decision="suspend"
            label="Motif de la suspension"
            button="Suspendre la boutique"
            min={reason.min}
            max={reason.max}
          />
        </section>
      )}
      {partner && shop.status === "suspended" && (
        <section aria-label="Décision">
          <ApproveForm action={decideShopAction} hidden={hidden}>
            Réactiver la boutique
          </ApproveForm>
        </section>
      )}
      {partner && shop.status === "rejected" && (
        <p className="text-ink-500 text-sm">
          Demande refusée : le vendeur peut corriger et redemander depuis son compte.
        </p>
      )}
    </StaffShell>
  );
}
