/**
 * Envoi d'e-mails (socle technique partagé par les modules : codes d'identité S4, factures S5-T06).
 * Le transport ne voit qu'un e-mail déjà rédigé ; il ne journalise jamais son contenu.
 */
export interface EmailAttachment {
  /** Nom du fichier (ex. « facture-KMD-F-2026-000001.pdf ») */
  filename: string;
  contentType: "application/pdf";
  content: Uint8Array;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Étiquette du fournisseur (statistiques), ex. « kemdia-identite », « kemdia-factures » */
  tag?: string;
  attachments?: readonly EmailAttachment[];
}

/** Un service qui remet un e-mail déjà rédigé (Mailpit, Brevo…). */
export interface MailTransport {
  /** Nom affiché dans les journaux */
  readonly name: string;
  send(email: Email): Promise<void>;
}

/** Pièces jointes : 2 Mo au plus en tout (une facture fait quelques Ko). */
export const MAX_ATTACHMENTS_BYTES = 2 * 1024 * 1024;

export function attachmentsOf(email: Email): readonly EmailAttachment[] {
  const list = email.attachments ?? [];
  const total = list.reduce((n, a) => n + a.content.byteLength, 0);
  if (total > MAX_ATTACHMENTS_BYTES) throw new Error("pièces jointes trop lourdes");
  return list;
}

export const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
