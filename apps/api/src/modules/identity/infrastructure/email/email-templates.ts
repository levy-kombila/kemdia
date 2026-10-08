import { OTP_TTL_MS } from "../../domain/otp.js";
import type { OtpMessage } from "../../application/ports.js";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

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
