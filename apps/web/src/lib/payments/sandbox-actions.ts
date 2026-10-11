"use server";

import { UUID_PATTERN } from "@kemdia/contracts/constants";
import { refresh } from "next/cache";
import { formatFCFA } from "@/lib/format";
import { sandboxApi, sandboxPageEnabled, sessionToken } from "./sandbox";
import { sandboxMessage } from "./sandbox-messages";

/**
 * Action serveur du téléphone simulé (S5-T05). Point d'entrée public : chaque champ est revérifié ici, et l'API
 * refait tout (demande du compte connecté seulement, code PIN). Le jeton reste dans son cookie `HttpOnly`.
 */
export type SandboxActionState = { tone: "success" | "error"; message: string } | null;

const PIN = /^\d{4}$/;

export async function decideSandboxPayment(
  _previous: SandboxActionState,
  form: FormData,
): Promise<SandboxActionState> {
  if (!sandboxPageEnabled()) return { tone: "error", message: sandboxMessage("BAC_A_SABLE_FERME") };
  const paymentId = form.get("paymentId");
  const decision = form.get("decision");
  const pin = form.get("pin");
  if (
    typeof paymentId !== "string" ||
    paymentId.length !== 36 ||
    !UUID_PATTERN.test(paymentId) ||
    (decision !== "approve" && decision !== "decline")
  ) {
    return { tone: "error", message: sandboxMessage("INDISPONIBLE") };
  }
  if (decision === "approve" && (typeof pin !== "string" || !PIN.test(pin))) {
    return { tone: "error", message: sandboxMessage("CODE_PIN_INVALIDE") };
  }
  const token = await sessionToken();
  if (!token) return { tone: "error", message: sandboxMessage("SESSION_INVALIDE") };
  const result = await sandboxApi().decide(
    token,
    paymentId,
    decision,
    decision === "approve" ? (pin as string) : undefined,
  );
  // La liste du téléphone change dans tous les cas (demande répondue, ou disparue)
  refresh();
  if (!result.ok) return { tone: "error", message: sandboxMessage(result.code) };
  if (result.data.status === "succeeded") {
    return { tone: "success", message: "Paiement validé : la commande est payée." };
  }
  return {
    tone: "error",
    message:
      result.data.failureReason === "solde_insuffisant"
        ? `Paiement refusé : solde insuffisant (solde fictif de ${formatFCFA(500_000)}).`
        : "Paiement refusé.",
  };
}
