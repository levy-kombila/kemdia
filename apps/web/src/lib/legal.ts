import { ACCOUNT_RETENTION } from "@kemdia/contracts/constants";

/**
 * Informations légales de l'éditeur et du responsable des traitements (S7-T08, ADR-0047).
 * `null` = pas encore fourni par le client (question ouverte n°10, regles-metier.md) : la page affiche « à compléter »,
 * rien n'est inventé. À remplir AVANT l'ouverture au public.
 */
export const LEGAL = {
  /** Raison sociale et forme (SARL, SA…) */
  company: null as string | null,
  /** Siège social (adresse postale) */
  headOffice: null as string | null,
  rccm: null as string | null,
  nif: null as string | null,
  /** Directeur de la publication (nom, qualité) */
  publisher: null as string | null,
  /** Délégué à la protection des données (DPO), s'il est désigné (loi 001/2011 modifiée, art. 89) */
  dpo: null as string | null,
  /** E-mail pour exercer ses droits (accès, rectification, effacement, opposition) */
  privacyEmail: null as string | null,
  /** Numéro ou date du récépissé de déclaration à l'APDPVP */
  apdpvpReceipt: null as string | null,
  /** Hébergeur de la production (nom, adresse, pays) */
  productionHost: null as string | null,
} as const;

/** Durées de conservation affichées dans la politique (mêmes valeurs que l'API). */
export const RETENTION = ACCOUNT_RETENTION;

export const TO_COMPLETE = "à compléter";
