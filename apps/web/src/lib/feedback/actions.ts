"use server";

import { headers } from "next/headers";
import { sessionToken } from "@/lib/orders/orders";
import { feedbackApi } from "./feedback";
import { FEEDBACK_MESSAGES, checkProblem, pageFrom } from "./messages";

export type ProblemFormState = { ok: boolean; message: string } | null;

/** « Signaler un problème » (S8-T02) : revérifié ici, puis par l'API. */
export async function reportProblemAction(
  _previous: ProblemFormState,
  form: FormData,
): Promise<ProblemFormState> {
  const token = await sessionToken();
  if (!token) return { ok: false, message: FEEDBACK_MESSAGES.SESSION_INVALIDE };
  const checked = checkProblem(form.get("category"), form.get("message"));
  if (!checked.ok) return { ok: false, message: checked.message };
  const userAgent = (await headers()).get("user-agent");
  const result = await feedbackApi().report(
    token,
    { category: checked.category, message: checked.message, page: pageFrom(form.get("page")) },
    userAgent,
  );
  if (!result.ok) return { ok: false, message: FEEDBACK_MESSAGES[result.code] };
  return {
    ok: true,
    message:
      "Merci ! Votre signalement est arrivé à l'équipe Kemdia. Nous vous répondrons par e-mail si besoin.",
  };
}
