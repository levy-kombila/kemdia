import type { AdminKyc, AdminKycSummary, VendorKyc } from "@kemdia/contracts";
import type { AdminKycView } from "../application/kyc.service.js";
import type { KycCursor, KycSummary } from "../application/ports.js";
import { canEdit, missingDocuments, type KycFile } from "../domain/kyc.js";
import { decodeShopCursor, encodeShopCursor } from "./shop.presenter.js";

/** Champs communs, construits un par un : jamais une boîte chiffrée ni un champ ajouté plus tard par erreur. */
function common(file: KycFile) {
  return {
    status: file.status,
    holderKind: file.holderKind,
    legalName: file.legalName,
    idType: file.idType,
    rccmNumber: file.rccmNumber,
    payoutMethod: file.payoutMethod,
    payoutHolder: file.payoutHolder,
    documents: file.documents.map((d) => ({
      kind: d.kind,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    missingDocuments: missingDocuments(file),
    submittedAt: file.submittedAt?.toISOString() ?? null,
    reviewedAt: file.reviewedAt?.toISOString() ?? null,
    rejectionReason: file.rejectionReason,
  };
}

/** Vu par le vendeur : 4 derniers caractères seulement. */
export function presentVendorKyc(file: KycFile): VendorKyc {
  return {
    ...common(file),
    idNumberEnd: file.idNumberEnd,
    payoutAccountEnd: file.payoutAccountEnd,
    canEdit: canEdit(file),
  };
}

export function presentAdminKyc(view: AdminKycView): AdminKyc {
  return {
    ...common(view),
    shopId: view.shopId,
    shopName: view.shopName,
    idNumber: view.idNumber,
    payoutAccount: view.payoutAccount,
    reviewedBy: view.reviewedBy,
    documentsPurgeAt: view.documentsPurgeAt?.toISOString() ?? null,
  };
}

export function presentKycSummary(item: KycSummary): AdminKycSummary {
  return {
    shopId: item.shopId,
    shopName: item.shopName,
    status: item.status,
    holderKind: item.holderKind,
    submittedAt: item.submittedAt.toISOString(),
    reviewedAt: item.reviewedAt?.toISOString() ?? null,
  };
}

/** Même forme que la position dans la file des boutiques. */
export const encodeKycCursor = (cursor: KycCursor) =>
  encodeShopCursor({ submittedAt: cursor.submittedAt, id: cursor.shopId });
export function decodeKycCursor(raw: string): KycCursor {
  const { submittedAt, id } = decodeShopCursor(raw);
  return { submittedAt, shopId: id };
}
