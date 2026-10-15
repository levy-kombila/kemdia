/**
 * Mobile gabonais (mêmes règles que les modules identity et orders, et que le site) : « 077123456 », « 077 12 34 56 »,
 * « +241 77 12 34 56 », « 00241 077 12 34 56 ». Forme enregistrée : « +241077123456 ». 06… : Moov ; 07… : Airtel.
 * Copie volontaire : un module n'importe pas le domaine d'un autre (ADR-0006) ; la contrainte SQL de la table
 * `vendors.shops` refuse toute autre forme.
 */
export function normalizeGabonPhone(input: string): string | null {
  let digits = input.trim().replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+241")) digits = digits.slice(4);
  else if (digits.startsWith("00241")) digits = digits.slice(5);
  if (!/^\d+$/.test(digits)) return null;
  if (!digits.startsWith("0")) digits = `0${digits}`;
  if (!/^0[67]\d{7}$/.test(digits)) return null;
  return `+241${digits}`;
}
