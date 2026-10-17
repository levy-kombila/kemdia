import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { KycCursor, KycRepository, KycSecrets, KycSummary } from "../application/ports.js";
import type {
  KycDocumentKind,
  KycFile,
  KycHolderKind,
  KycIdType,
  KycPayoutMethod,
  KycStatus,
} from "../domain/kyc.js";

/**
 * Dossiers de vérification (S6-T08, ADR-0039). Les boîtes chiffrées ne sont lues que par `readSecrets` et
 * `readDocument` : jamais avec le reste du dossier (une liste ou un affichage ne déchiffre rien).
 */
type FileRow = Prisma.KycFileGetPayload<{
  include: { documents: { select: { kind: true; createdAt: true } } };
}>;
type DbStatus = FileRow["status"];
type DbKind = Prisma.KycDocumentGetPayload<object>["kind"];

const STATUS: Record<DbStatus, KycStatus> = {
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};
const STATUS_TO_DB = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k])) as Record<
  KycStatus,
  DbStatus
>;
const KIND: Record<DbKind, KycDocumentKind> = {
  ID_FRONT: "id_front",
  ID_BACK: "id_back",
  RCCM: "rccm",
};
const KIND_TO_DB = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [v, k])) as Record<
  KycDocumentKind,
  DbKind
>;
const upper = <T extends string>(value: string) => value.toUpperCase() as T;
const lower = <T extends string>(value: string) => value.toLowerCase() as T;

const DOCUMENTS = { documents: { select: { kind: true, createdAt: true } } } as const;

function toFile(row: FileRow): KycFile {
  return {
    shopId: row.shopId,
    status: STATUS[row.status],
    holderKind: lower<KycHolderKind>(row.holderKind),
    legalName: row.legalName,
    idType: lower<KycIdType>(row.idType),
    idNumberEnd: row.idNumberEnd,
    rccmNumber: row.rccmNumber,
    payoutMethod: lower<KycPayoutMethod>(row.payoutMethod),
    payoutAccountEnd: row.payoutAccountEnd,
    payoutHolder: row.payoutHolder,
    submittedAt: row.submittedAt,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
    documentsPurgeAt: row.documentsPurgeAt,
    documents: row.documents
      .map((d) => ({ kind: KIND[d.kind], uploadedAt: d.createdAt }))
      .sort((a, b) => a.kind.localeCompare(b.kind)),
  };
}

const bytes = (value: Uint8Array) => new Uint8Array(value);

@Injectable()
export class PrismaKycRepository implements KycRepository {
  constructor(private readonly tx: TransactionContext) {}

  async find(shopId: string): Promise<KycFile | null> {
    const row = await this.tx.db.kycFile.findUnique({ where: { shopId }, include: DOCUMENTS });
    return row ? toFile(row) : null;
  }

  async lock(shopId: string): Promise<KycFile | null> {
    await this.tx.db
      .$queryRaw`SELECT 1 FROM "vendors"."kyc_files" WHERE "shop_id" = ${shopId}::uuid FOR UPDATE`;
    return this.find(shopId);
  }

  async save(file: KycFile, now: Date, secrets?: KycSecrets): Promise<void> {
    const fields = {
      status: STATUS_TO_DB[file.status],
      holderKind: upper<FileRow["holderKind"]>(file.holderKind),
      legalName: file.legalName,
      idType: upper<FileRow["idType"]>(file.idType),
      idNumberEnd: file.idNumberEnd,
      rccmNumber: file.rccmNumber,
      payoutMethod: upper<FileRow["payoutMethod"]>(file.payoutMethod),
      payoutAccountEnd: file.payoutAccountEnd,
      payoutHolder: file.payoutHolder,
      submittedAt: file.submittedAt,
      reviewedBy: file.reviewedBy,
      reviewedAt: file.reviewedAt,
      rejectionReason: file.rejectionReason,
      documentsPurgeAt: file.documentsPurgeAt,
      updatedAt: now,
    };
    if (secrets) {
      const boxes = {
        idNumberBox: bytes(secrets.idNumber),
        payoutAccountBox: bytes(secrets.payoutAccount),
      };
      await this.tx.db.kycFile.upsert({
        where: { shopId: file.shopId },
        create: { shopId: file.shopId, ...fields, ...boxes },
        update: { ...fields, ...boxes },
      });
    } else {
      await this.tx.db.kycFile.update({ where: { shopId: file.shopId }, data: fields });
    }
    // Photos qui ne sont plus demandées (ou plus présentes dans le dossier) : effacées
    await this.tx.db.kycDocument.deleteMany({
      where: {
        shopId: file.shopId,
        kind: { notIn: file.documents.map((d) => KIND_TO_DB[d.kind]) },
      },
    });
  }

  async readSecrets(shopId: string): Promise<KycSecrets | null> {
    const row = await this.tx.db.kycFile.findUnique({
      where: { shopId },
      select: { idNumberBox: true, payoutAccountBox: true },
    });
    return row
      ? {
          idNumber: new Uint8Array(row.idNumberBox),
          payoutAccount: new Uint8Array(row.payoutAccountBox),
        }
      : null;
  }

  async putDocument(
    shopId: string,
    kind: KycDocumentKind,
    id: string,
    box: Uint8Array,
  ): Promise<Date> {
    const now = new Date();
    const row = await this.tx.db.kycDocument.upsert({
      where: { shopId_kind: { shopId, kind: KIND_TO_DB[kind] } },
      create: { id, shopId, kind: KIND_TO_DB[kind], box: bytes(box), createdAt: now },
      update: { id, box: bytes(box), createdAt: now },
      select: { createdAt: true },
    });
    return row.createdAt;
  }

  async readDocument(shopId: string, kind: KycDocumentKind): Promise<Uint8Array | null> {
    const row = await this.tx.db.kycDocument.findUnique({
      where: { shopId_kind: { shopId, kind: KIND_TO_DB[kind] } },
      select: { box: true },
    });
    return row ? new Uint8Array(row.box) : null;
  }

  async list(query: {
    status?: Exclude<KycStatus, "draft"> | undefined;
    limit: number;
    after?: KycCursor | undefined;
  }): Promise<{ items: KycSummary[]; next: KycCursor | null }> {
    const rows = await this.tx.db.kycFile.findMany({
      where: {
        status: query.status ? STATUS_TO_DB[query.status] : { not: "DRAFT" },
        submittedAt: { not: null },
        ...(query.after
          ? {
              OR: [
                { submittedAt: { gt: query.after.submittedAt } },
                { submittedAt: query.after.submittedAt, shopId: { gt: query.after.shopId } },
              ],
            }
          : {}),
      },
      orderBy: [{ submittedAt: "asc" }, { shopId: "asc" }],
      take: query.limit + 1,
      select: {
        shopId: true,
        status: true,
        holderKind: true,
        submittedAt: true,
        reviewedAt: true,
        shop: { select: { name: true } },
      },
    });
    const page = rows.slice(0, query.limit);
    const items: KycSummary[] = page.map((r) => ({
      shopId: r.shopId,
      shopName: r.shop.name,
      status: STATUS[r.status],
      holderKind: lower<KycHolderKind>(r.holderKind),
      submittedAt: r.submittedAt!,
      reviewedAt: r.reviewedAt,
    }));
    const last = items.at(-1);
    return {
      items,
      next:
        rows.length > query.limit && last
          ? { submittedAt: last.submittedAt, shopId: last.shopId }
          : null,
    };
  }

  async purgeDocuments(now: Date): Promise<number> {
    // Dossiers décidés seulement, verrouillés le temps de l'effacement ; un dossier en cours de correction par son
    // vendeur (verrouillé) est laissé pour le passage suivant (relecture S6-T08)
    const due = await this.tx.db.$queryRaw<{ shop_id: string }[]>`
      SELECT "shop_id" FROM "vendors"."kyc_files"
      WHERE "documents_purge_at" <= ${now} AND "status" IN ('APPROVED', 'REJECTED')
      FOR UPDATE SKIP LOCKED`;
    if (due.length === 0) return 0;
    const { count } = await this.tx.db.kycDocument.deleteMany({
      where: { shopId: { in: due.map((row) => row.shop_id) } },
    });
    return count;
  }
}
