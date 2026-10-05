import { BadgeCheck, ShieldCheck, Smartphone, Truck } from "lucide-react";
import type { ReactNode } from "react";

const BENEFITS = [
  { icon: Smartphone, text: "Paiement Airtel Money et Moov Money" },
  { icon: Truck, text: "Suivi de vos livraisons partout au Gabon" },
  { icon: BadgeCheck, text: "Vendeurs vérifiés par Kemdia" },
  { icon: ShieldCheck, text: "Vos données protégées, jamais revendues" },
];

/** Mise en page commune : carte du formulaire + rappel des avantages (grand écran). */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="container-page py-6 sm:py-10">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] lg:grid-cols-[1fr_1.1fr]">
        <aside className="from-brand-600 to-brand-800 relative hidden flex-col justify-between bg-gradient-to-br p-10 text-white lg:flex">
          <div>
            <p className="font-display text-3xl font-extrabold leading-tight">
              Le shopping en ligne,
              <br />
              livré partout au Gabon.
            </p>
            <ul className="mt-8 space-y-4">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-medium">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-10 flex h-1.5 overflow-hidden rounded-full" aria-hidden>
            <span className="bg-gabon-green flex-1" />
            <span className="bg-gabon-yellow flex-1" />
            <span className="bg-gabon-blue flex-1" />
          </div>
        </aside>
        <div className="p-6 sm:p-10">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {subtitle && <p className="text-ink-500 mt-1.5">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
