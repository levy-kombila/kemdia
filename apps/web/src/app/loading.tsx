import { WakeUpNotice } from "@/components/layout/WakeUpNotice";

/**
 * Envoyé tout de suite pour chaque page qui attend ses données (S4-T08) : sur la démo endormie, le visiteur voit
 * « La boutique se réveille » au lieu d'une page blanche pendant le réveil de l'API (jusqu'à ~1 min).
 * `APP_ENV` est lu à la demande (pages rendues à chaque requête depuis le S4-T07).
 */
export default function Loading() {
  return <WakeUpNotice demo={process.env.APP_ENV === "demo"} />;
}
