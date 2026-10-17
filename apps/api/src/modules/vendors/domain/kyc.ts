import { normalizeGabonPhone } from "./gabon-phone.js";
import { VendorsError } from "./vendors-error.js";

/**
 * Dossier de vérification d'un vendeur, KYC (S6-T08, ADR-0039 ; BR-024) — TypeScript pur.
 *
 * Le vendeur remplit son dossier (identité, RCCM pour une entreprise, compte de versement), envoie les photos
 * demandées, puis l'envoie. Un administrateur le valide ou le refuse (motif montré au vendeur). Après un refus, le
 * vendeur le corrige et le renvoie. Un dossier validé ne change plus (changement de compte : service client).
 * Un KYC non validé bloque seulement les versements (BR-024), pas les ventes (choix du 2026-10-17).
 */
export const KYC_STATUSES = ["draft", "pending", "approved", "rejected"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export type KycHolderKind = "individual" | "company";
export type KycIdType = "cni" | "passeport" | "carte_sejour";
export type KycPayoutMethod = "airtel" | "moov" | "bank";
export const KYC_DOCUMENT_KINDS = ["id_front", "id_back", "rccm"] as const;
export type KycDocumentKind = (typeof KYC_DOCUMENT_KINDS)[number];

// Mêmes valeurs que KYC_LIMITS et KYC_DOCUMENT_RETENTION_DAYS du contrat et la migration SQL (test d'alignement)
export const KYC_RULES = {
  nameMin: 2,
  nameMax: 100,
  idNumberMin: 4,
  idNumberMax: 30,
  rccmMin: 5,
  rccmMax: 40,
  bankAccountMin: 10,
  bankAccountMax: 34,
  reasonMin: 5,
  reasonMax: 300,
  retentionDays: 30,
} as const;
const DAY_MS = 86_400_000;

/** Champs en clair, validés (les numéros sensibles seront chiffrés par le service). */
export interface KycDetails {
  holderKind: KycHolderKind;
  legalName: string;
  idType: KycIdType;
  idNumber: string;
  rccmNumber: string | null;
  payoutMethod: KycPayoutMethod;
  payoutAccount: string;
  payoutHolder: string;
}

export interface KycFile {
  shopId: string;
  status: KycStatus;
  holderKind: KycHolderKind;
  legalName: string;
  idType: KycIdType;
  /** 4 derniers caractères seulement (le numéro complet est chiffré) */
  idNumberEnd: string;
  rccmNumber: string | null;
  payoutMethod: KycPayoutMethod;
  payoutAccountEnd: string;
  payoutHolder: string;
  submittedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  documentsPurgeAt: Date | null;
  /** Photos présentes (sorte et date d'envoi) */
  documents: { kind: KycDocumentKind; uploadedAt: Date }[];
}

const invalid = (message: string) => new VendorsError("KYC_INVALIDE", message);
/** Caractère de contrôle (retour à la ligne, tabulation…) : refusé dans un nom. */
const hasControl = (text: string) =>
  [...text].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

function name(value: string, what: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  const length = [...text].length;
  if (hasControl(text) || length < KYC_RULES.nameMin || length > KYC_RULES.nameMax) {
    throw invalid(`${what} : ${KYC_RULES.nameMin} à ${KYC_RULES.nameMax} caractères`);
  }
  return text;
}

/** Vérifie et met en forme la saisie (majuscules, espaces retirés des numéros, mobile au format +241…). */
export function validateKyc(input: {
  holderKind: KycHolderKind;
  legalName: string;
  idType: KycIdType;
  idNumber: string;
  rccmNumber: string | null;
  payoutMethod: KycPayoutMethod;
  payoutAccount: string;
  payoutHolder: string;
}): KycDetails {
  const legalName = name(input.legalName, "nom sur la pièce");
  const payoutHolder = name(input.payoutHolder, "titulaire du compte");

  const idNumber = input.idNumber.replace(/[\s-]/g, "").toUpperCase();
  const idPattern = new RegExp(`^[A-Z0-9]{${KYC_RULES.idNumberMin},${KYC_RULES.idNumberMax}}$`);
  if (!idPattern.test(idNumber)) {
    throw invalid(
      `numéro de la pièce : ${KYC_RULES.idNumberMin} à ${KYC_RULES.idNumberMax} lettres ou chiffres`,
    );
  }

  let rccmNumber: string | null = null;
  const rccm = (input.rccmNumber ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  if (input.holderKind === "company") {
    if (
      rccm.length < KYC_RULES.rccmMin ||
      rccm.length > KYC_RULES.rccmMax ||
      !/^[A-Z0-9][A-Z0-9 ./-]*$/.test(rccm)
    ) {
      throw invalid(
        `numéro RCCM : obligatoire pour une entreprise (${KYC_RULES.rccmMin} à ${KYC_RULES.rccmMax} caractères)`,
      );
    }
    rccmNumber = rccm;
  } else if (rccm !== "") {
    throw invalid("numéro RCCM : seulement pour une entreprise");
  }

  let payoutAccount: string;
  if (input.payoutMethod === "bank") {
    payoutAccount = input.payoutAccount.replace(/[\s-]/g, "").toUpperCase();
    const bank = new RegExp(`^[A-Z0-9]{${KYC_RULES.bankAccountMin},${KYC_RULES.bankAccountMax}}$`);
    if (!bank.test(payoutAccount)) {
      throw invalid(
        `compte bancaire : ${KYC_RULES.bankAccountMin} à ${KYC_RULES.bankAccountMax} lettres ou chiffres (RIB ou IBAN)`,
      );
    }
  } else {
    const phone = normalizeGabonPhone(input.payoutAccount);
    // 06… : Moov ; 07… : Airtel (même règle que le paiement Mobile Money)
    const prefix = input.payoutMethod === "moov" ? "+2410" + "6" : "+2410" + "7";
    if (!phone || !phone.startsWith(prefix)) {
      throw invalid(
        input.payoutMethod === "moov"
          ? "compte Moov Money : numéro en 06… attendu"
          : "compte Airtel Money : numéro en 07… attendu",
      );
    }
    payoutAccount = phone;
  }

  return {
    holderKind: input.holderKind,
    legalName,
    idType: input.idType,
    idNumber,
    rccmNumber,
    payoutMethod: input.payoutMethod,
    payoutAccount,
    payoutHolder,
  };
}

/** 4 derniers caractères (ce que voit le vendeur, et ce qui reste en clair dans la base). */
export const lastFour = (value: string) => value.slice(-4);

/** Photos exigées : recto toujours ; verso sauf pour un passeport ; extrait RCCM pour une entreprise. */
export function requiredDocuments(file: Pick<KycFile, "idType" | "holderKind">): KycDocumentKind[] {
  const kinds: KycDocumentKind[] = ["id_front"];
  if (file.idType !== "passeport") kinds.push("id_back");
  if (file.holderKind === "company") kinds.push("rccm");
  return kinds;
}

export function missingDocuments(file: KycFile): KycDocumentKind[] {
  const present = new Set(file.documents.map((d) => d.kind));
  return requiredDocuments(file).filter((kind) => !present.has(kind));
}

/** Le vendeur peut modifier son dossier et ses photos : en préparation ou refusé. */
export const canEdit = (file: Pick<KycFile, "status">) =>
  file.status === "draft" || file.status === "rejected";

function requireEditable(file: KycFile): void {
  if (!canEdit(file)) {
    throw new VendorsError(
      "STATUT_KYC_INCOMPATIBLE",
      file.status === "pending"
        ? "dossier envoyé : il attend la décision de l'équipe Kemdia"
        : "dossier validé : pour changer de compte de versement, contactez le service client",
    );
  }
}

/** Nouveau dossier, ou dossier modifié : il repasse « en préparation » (un refus s'efface). */
export function editKyc(file: KycFile | null, shopId: string, details: KycDetails): KycFile {
  if (file) requireEditable(file);
  return {
    shopId,
    status: "draft",
    holderKind: details.holderKind,
    legalName: details.legalName,
    idType: details.idType,
    idNumberEnd: lastFour(details.idNumber),
    rccmNumber: details.rccmNumber,
    payoutMethod: details.payoutMethod,
    payoutAccountEnd: lastFour(details.payoutAccount),
    payoutHolder: details.payoutHolder,
    submittedAt: file?.submittedAt ?? null,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    documentsPurgeAt: null,
    // Une photo qui n'est plus demandée (passeport après une carte, personne seule après une entreprise) est retirée
    documents: (file?.documents ?? []).filter((d) => requiredDocuments(details).includes(d.kind)),
  };
}

/** Une photo ajoutée ou remplacée : seulement une sorte demandée, sur un dossier modifiable. */
export function checkDocument(file: KycFile, kind: KycDocumentKind): void {
  requireEditable(file);
  if (!requiredDocuments(file).includes(kind)) {
    throw invalid(
      kind === "rccm"
        ? "extrait RCCM : seulement pour une entreprise"
        : "verso : pas demandé pour un passeport",
    );
  }
}

/** Envoi à l'équipe : toutes les photos demandées sont là. */
export function submitKyc(file: KycFile, now: Date): KycFile {
  requireEditable(file);
  const missing = missingDocuments(file);
  if (missing.length > 0) {
    throw new VendorsError("KYC_INCOMPLET", `photos manquantes : ${missing.join(", ")}`);
  }
  return { ...file, status: "pending", submittedAt: now, rejectionReason: null };
}

/** Décision d'un administrateur sur un dossier envoyé ; photos effacées 30 jours plus tard. */
export function decideKyc(
  file: KycFile,
  decision: "approve" | "reject",
  by: { adminId: string; reason: string | null; now: Date },
): KycFile {
  if (file.status !== "pending") {
    throw new VendorsError(
      "STATUT_KYC_INCOMPATIBLE",
      "seul un dossier envoyé (en attente) peut être validé ou refusé",
    );
  }
  let reason: string | null = null;
  if (decision === "reject") {
    reason = (by.reason ?? "").trim().replace(/\s+/g, " ");
    const length = [...reason].length;
    if (length < KYC_RULES.reasonMin || length > KYC_RULES.reasonMax) {
      throw invalid(`motif du refus : ${KYC_RULES.reasonMin} à ${KYC_RULES.reasonMax} caractères`);
    }
  }
  return {
    ...file,
    status: decision === "approve" ? "approved" : "rejected",
    reviewedBy: by.adminId,
    reviewedAt: by.now,
    rejectionReason: reason,
    documentsPurgeAt: new Date(by.now.getTime() + KYC_RULES.retentionDays * DAY_MS),
  };
}
