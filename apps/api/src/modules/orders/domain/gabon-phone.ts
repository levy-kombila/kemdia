/**
 * Mobile gabonais (mêmes règles que l'identité et que le site) : « 077123456 », « 077 12 34 56 »,
 * « +241 77 12 34 56 », « 00241 077 12 34 56 ». Forme enregistrée : « +241077123456 ».
 * 06… : Moov ; 07… : Airtel.
 */
export type MobileOperator = "Moov" | "Airtel";

export function normalizeGabonPhone(
  input: string,
): { value: string; operator: MobileOperator } | null {
  let digits = input.trim().replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+241")) digits = digits.slice(4);
  else if (digits.startsWith("00241")) digits = digits.slice(5);
  if (!/^\d+$/.test(digits)) return null;
  if (!digits.startsWith("0")) digits = `0${digits}`;
  if (!/^0[67]\d{7}$/.test(digits)) return null;
  return { value: `+241${digits}`, operator: digits[1] === "6" ? "Moov" : "Airtel" };
}
