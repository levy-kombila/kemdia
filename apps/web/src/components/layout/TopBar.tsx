import { Clock, ShieldCheck, Smartphone, Truck } from "lucide-react";

const ITEMS = [
  { icon: ShieldCheck, text: "Paiement 100 % sécurisé" },
  { icon: Smartphone, text: "Airtel Money · Moov Money" },
  { icon: Truck, text: "Livraison offerte à Libreville dès 25 000 FCFA" },
  { icon: Clock, text: "Livré en 24–48 h à Libreville" },
];

export function TopBar() {
  return (
    <div className="bg-brand-700 text-xs text-white">
      <div className="container-page flex h-9 items-center justify-center gap-6 overflow-hidden md:justify-between">
        {ITEMS.map(({ icon: Icon, text }, i) => (
          <span
            key={text}
            className={
              i === 2 ? "flex items-center gap-1.5" : "hidden items-center gap-1.5 md:flex"
            }
          >
            <Icon className="text-accent-400 size-3.5" aria-hidden />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
