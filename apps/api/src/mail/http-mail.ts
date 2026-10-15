/** Petit appel HTTP JSON avec délai maximal ; le message d'erreur ne contient jamais la clé ni le contenu. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const MAIL_TIMEOUT_MS = 10_000;

export async function postJson(
  fetchImpl: FetchLike,
  service: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  okStatuses: readonly number[],
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError" ? "délai dépassé" : "injoignable";
    throw new Error(`${service} : ${reason}`, { cause: error });
  }
  if (!okStatuses.includes(response.status)) {
    // Le corps de la réponse peut recopier la requête (adresse du destinataire) : on ne garde que le statut
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`${service} : réponse HTTP ${response.status}`);
  }
  await response.body?.cancel().catch(() => undefined);
}
