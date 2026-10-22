import { hashSecret } from "./secret.js";

/**
 * Appareils (S7.5-T04, ADR-0051). Le site garde dans un cookie un identifiant aléatoire par navigateur ; l'API n'en
 * garde que l'empreinte et s'en sert seulement pour reconnaître un appareil déjà utilisé (jamais pour ouvrir une
 * session).
 */
export const hashDeviceId = hashSecret;
export const hashAlertToken = hashSecret;

const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS: readonly [RegExp, string][] = [
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iPhone ou iPad"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "Mac"],
  [/Linux/, "Linux"],
];

/**
 * Description de l'appareil pour l'avis (« Chrome sur Android ») : choisie dans des listes fixes, jamais recopiée du
 * navigateur. Un en-tête inventé par un pirate ne peut donc rien écrire dans le message envoyé au titulaire.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  if (browser && system) return `${browser} sur ${system}`;
  return browser ?? (system ? `un navigateur sur ${system}` : "un navigateur inconnu");
}
