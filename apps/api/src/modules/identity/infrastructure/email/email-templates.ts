import { OTP_TTL_MS } from "../../domain/otp.js";
import type { OtpMessage } from "../../application/ports.js";

import type { Email } from "../../../../mail/mail-transport.js";

export type { Email };

const minutes = OTP_TTL_MS / 60_000;

/**
 * Mise en page commune : texte court, aucun lien (un e-mail de code ne doit jamais inviter à cliquer :
 * c'est ce que font les e-mails d'hameçonnage), aucune image externe (pas de pistage).
 */
function layout(title: string, paragraphs: string[], code?: string): string {
  const p = (t: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#1f2937">${t}</p>`;
  const codeBlock = code
    ? `<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;font-family:Consolas,monospace">${code}</p>`
    : "";
  return [
    '<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">',
    '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">',
    `<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#ea580c">Kemdia</p>`,
    `<h1 style="margin:0 0 16px;font-size:18px;color:#111827">${title}</h1>`,
    paragraphs.slice(0, 1).map(p).join(""),
    codeBlock,
    paragraphs.slice(1).map(p).join(""),
    "</div></body></html>",
  ].join("");
}

/** Avis de sécurité de la double authentification (S6-T03). */
const SECOND_FACTOR_NOTICES = {
  setup: {
    subject: "QR code de double authentification affiché",
    body: "Un QR code de double authentification vient d'être affiché pour votre compte Kemdia, après saisie de votre mot de passe.",
  },
  "recovery-used": {
    subject: "Code de secours utilisé sur votre compte Kemdia",
    body: "Un de vos codes de secours vient d'être utilisé pour confirmer une session de votre compte Kemdia. Il ne servira plus.",
  },
  enabled: {
    subject: "Double authentification activée sur votre compte Kemdia",
    body: "La double authentification vient d'être activée sur votre compte Kemdia. Gardez vos codes de secours en lieu sûr, hors de votre téléphone.",
  },
  "recovery-regenerated": {
    subject: "Nouveaux codes de secours Kemdia",
    body: "De nouveaux codes de secours viennent d'être créés pour votre compte Kemdia. Les anciens ne fonctionnent plus.",
  },
  locked: {
    subject: "Codes de double authentification refusés",
    body: "Plusieurs codes de double authentification faux ont été saisis sur votre compte Kemdia. Par sécurité, des sessions ont été fermées et les codes sont bloqués 15 minutes.",
  },
  reset: {
    subject: "Double authentification remise à zéro",
    body: "La double authentification de votre compte Kemdia a été remise à zéro par l'exploitant, toutes vos sessions ont été fermées et votre mot de passe ne fonctionne plus. Choisissez-en un nouveau avec « Mot de passe oublié », puis réactivez la double authentification.",
  },
} as const;

/** Contenu des e-mails, en français. Seules des valeurs produites par le serveur y figurent (aucune saisie de l'utilisateur). */
export function renderEmail(message: OtpMessage): Email {
  if (message.kind === "signup-alert") {
    const lines = [
      "Quelqu'un vient d'essayer de créer un compte Kemdia avec votre adresse e-mail, qui a déjà un compte.",
      "Si c'est vous : connectez-vous avec votre mot de passe habituel, ou utilisez « Mot de passe oublié » sur le site.",
      "Si ce n'est pas vous : vous n'avez rien à faire, votre compte n'a pas été modifié.",
    ];
    return {
      to: message.to,
      subject: "Tentative d'inscription avec votre adresse",
      text: ["Kemdia", "", ...lines].join("\n"),
      html: layout("Tentative d'inscription avec votre adresse", lines),
    };
  }

  if (message.kind === "second-factor") {
    const notice = SECOND_FACTOR_NOTICES[message.event];
    const lines = [
      notice.body,
      "Si c'est vous : vous n'avez rien à faire.",
      "Si ce n'est pas vous : changez tout de suite votre mot de passe (« Mot de passe oublié » sur le site), puis prévenez l'administrateur de Kemdia.",
    ];
    return {
      to: message.to,
      subject: notice.subject,
      text: ["Kemdia", "", ...lines].join("\n"),
      html: layout(notice.subject, lines),
    };
  }

  if (message.kind === "account-deleted") {
    const lines = [
      "Votre compte Kemdia a été supprimé, comme demandé. Vos nom, adresse e-mail, téléphone et adresses de livraison ont été effacés.",
      "Seules les factures restent conservées 10 ans, comme l'exige la loi comptable (OHADA), telles qu'elles ont été émises (nom, téléphone et adresse de l'acheteur) ; elles ne servent plus qu'à la comptabilité.",
      "Si vous n'êtes pas à l'origine de cette suppression, contactez tout de suite le service client Kemdia.",
    ];
    return {
      to: message.to,
      subject: "Votre compte Kemdia a été supprimé",
      text: ["Kemdia", "", ...lines].join("\n"),
      html: layout("Votre compte a été supprimé", lines),
    };
  }

  if (message.kind === "inactivity-warning") {
    const date = message.deleteOn.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Africa/Libreville",
    });
    const lines = [
      `Vous ne vous êtes pas connecté à Kemdia depuis bientôt 3 ans. Pour ne pas garder vos données plus longtemps que nécessaire, votre compte sera supprimé le ${date}.`,
      "Pour le garder, il suffit de vous connecter sur le site avant cette date.",
      "Si vous ne faites rien, vos données personnelles seront effacées ; seules les factures restent conservées 10 ans (loi comptable OHADA), telles qu'elles ont été émises.",
    ];
    return {
      to: message.to,
      subject: "Votre compte Kemdia sera bientôt supprimé",
      text: ["Kemdia", "", ...lines].join("\n"),
      html: layout("Votre compte sera bientôt supprimé", lines),
    };
  }

  if (message.kind === "new-device") {
    const when = message.at.toLocaleString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Libreville",
    });
    const subject = "Nouvelle connexion à votre compte Kemdia";
    const intro = `Votre compte Kemdia vient d'être ouvert depuis un appareil que nous ne connaissions pas : ${message.device}, le ${when} (heure de Libreville).`;
    const notMe = message.link
      ? "Si ce n'est pas vous : utilisez le lien ci-dessous pour déconnecter tout de suite tous les appareils, puis changez votre mot de passe (« Mot de passe oublié » sur le site)."
      : "Si ce n'est pas vous : utilisez tout de suite « Mot de passe oublié » sur le site ; tous les appareils seront déconnectés.";
    const lines = [intro, "Si c'est vous : vous n'avez rien à faire.", notMe];
    const button = message.link
      ? `<p style="margin:0 0 16px"><a href="${escapeHtml(message.link)}" style="display:inline-block;background:#111827;color:#ffffff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:700">Ce n'est pas moi</a></p>`
      : "";
    return {
      to: message.to,
      subject,
      text: ["Kemdia", "", ...lines, ...(message.link ? ["", message.link] : [])].join("\n"),
      html: layout(subject, lines).replace("</div></body>", `${button}</div></body>`),
    };
  }

  if (message.kind === "password-changed") {
    const lines = [
      "Le mot de passe de votre compte Kemdia vient d'être modifié, et vos autres appareils ont été déconnectés.",
      "Si c'est vous : vous n'avez rien à faire.",
      "Si ce n'est pas vous : utilisez tout de suite « Mot de passe oublié » sur le site pour reprendre la main, puis contactez le service client Kemdia.",
    ];
    return {
      to: message.to,
      subject: "Votre mot de passe Kemdia a été modifié",
      text: ["Kemdia", "", ...lines].join("\n"),
      html: layout("Votre mot de passe a été modifié", lines),
    };
  }

  const signup = message.purpose === "signup";
  const subject = signup
    ? "Votre code de vérification Kemdia"
    : "Votre code pour changer de mot de passe";
  const intro = signup
    ? "Voici votre code pour terminer la création de votre compte Kemdia :"
    : "Voici votre code pour choisir un nouveau mot de passe :";
  const after = [
    `Il est valable ${minutes} minutes. Ne le communiquez à personne : l'équipe Kemdia ne vous le demandera jamais.`,
    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
  ];
  return {
    to: message.to,
    subject,
    text: ["Kemdia", "", intro, "", message.code, "", ...after].join("\n"),
    html: layout(subject, [intro, ...after], message.code),
  };
}

/** Échappement HTML (texte placé dans un attribut ou un paragraphe d'e-mail). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
