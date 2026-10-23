import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { AvatarStore } from "../application/ports.js";
import { avatarVersionOf, type ProcessedAvatar } from "../domain/avatar.js";

/**
 * Photos de profil dans PostgreSQL (`identity.account_avatars`, S7.5-T08). La photo et sa version sur le compte
 * changent ensemble, dans la transaction en cours.
 */
@Injectable()
export class PrismaAvatarStore implements AvatarStore {
  constructor(private readonly tx: TransactionContext) {}

  async save(accountId: string, avatar: ProcessedAvatar, now: Date): Promise<void> {
    const db = this.tx.db;
    const data = { image: Uint8Array.from(avatar.image), sha256: avatar.sha256, updatedAt: now };
    await db.accountAvatar.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });
    await db.account.update({
      where: { id: accountId },
      data: { avatarVersion: avatarVersionOf(avatar.sha256) },
    });
  }

  async read(accountId: string): Promise<{ image: Uint8Array; sha256: string } | null> {
    const row = await this.tx.db.accountAvatar.findUnique({
      where: { accountId },
      select: { image: true, sha256: true },
    });
    return row ? { image: new Uint8Array(row.image), sha256: row.sha256 } : null;
  }

  async remove(accountId: string): Promise<boolean> {
    const db = this.tx.db;
    const { count } = await db.accountAvatar.deleteMany({ where: { accountId } });
    await db.account.update({ where: { id: accountId }, data: { avatarVersion: null } });
    return count > 0;
  }
}
