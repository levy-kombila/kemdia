import { Inject, Injectable } from "@nestjs/common";
import { noAvatar } from "../domain/avatar.js";
import {
  AVATAR_PROCESSOR,
  AVATAR_STORE,
  IDENTITY_CLOCK,
  TRANSACTION_RUNNER,
  type AvatarProcessor,
  type AvatarStore,
  type Clock,
  type TransactionRunner,
} from "./ports.js";

/**
 * Photo de profil (S7.5-T08, ADR-0055) : le titulaire du compte envoie, voit et retire SA photo ; personne d'autre ne
 * la voit (pas de modération). Le fichier est recadré et réencodé avant d'être rangé ; la version notée sur le compte
 * change à chaque photo (le site s'en sert dans l'adresse : une nouvelle photo n'est jamais cachée par l'ancienne).
 */
@Injectable()
export class AvatarService {
  constructor(
    @Inject(AVATAR_PROCESSOR) private readonly processor: AvatarProcessor,
    @Inject(AVATAR_STORE) private readonly store: AvatarStore,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
  ) {}

  /** Remplace la photo ; renvoie sa version. Réencodage AVANT la transaction (calcul long, aucune ligne verrouillée). */
  async upload(accountId: string, bytes: Uint8Array): Promise<string> {
    const avatar = await this.processor.process(bytes);
    await this.tx.run(() => this.store.save(accountId, avatar, this.clock.now()));
    return avatar.sha256.slice(0, 16);
  }

  async read(accountId: string): Promise<{ image: Uint8Array; sha256: string }> {
    const avatar = await this.store.read(accountId);
    if (!avatar) throw noAvatar();
    return avatar;
  }

  /** Retire la photo (les initiales reviennent). Sans photo : `PHOTO_ABSENTE`. */
  async remove(accountId: string): Promise<void> {
    if (!(await this.tx.run(() => this.store.remove(accountId)))) throw noAvatar();
  }
}
