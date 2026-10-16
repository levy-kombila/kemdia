import { BadgeCheck, ShieldCheck, Smartphone, Truck } from "lucide-react";
import { ProductImage } from "@/components/ui/ProductImage";
import type { ReactNode } from "react";
import { getBestsellers, getFeaturedProducts } from "@/lib/catalog";

const BENEFITS = [
  { icon: Smartphone, text: "Airtel Money et Moov Money" },
  { icon: Truck, text: "Suivi de vos livraisons" },
  { icon: BadgeCheck, text: "Vendeurs vérifiés" },
  { icon: ShieldCheck, text: "Données jamais revendues" },
];

/** Mise en page commune : carte du formulaire + rappel des avantages (grand écran). */
export async function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const seen = new Set<string>();
  const [featured, bestsellers] = await Promise.all([getFeaturedProducts(12), getBestsellers(12)]);
  const products = [...featured, ...bestsellers]
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .slice(0, 12);
  return (
    <div className="container-page py-6 sm:py-10">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl bg-white lg:grid-cols-[1fr_1.1fr]">
        <aside className="bg-brand-600 relative hidden min-h-[36rem] overflow-hidden lg:block">
          {/* Mur de produits incliné : on voit tout de suite ce qu'on vient chercher sur Kemdia */}
          <ul aria-hidden className="absolute -inset-x-16 -top-10 grid -rotate-6 grid-cols-3 gap-3">
            {products.map((p) => (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-white">
                {p.image && (
                  <ProductImage
                    src={p.image}
                    alt=""
                    fill
                    sizes="160px"
                    className="object-contain p-3"
                  />
                )}
              </li>
            ))}
          </ul>
          <div className="from-brand-800 via-brand-700/95 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent px-8 pb-8 pt-24 text-white">
            <p className="font-display text-[1.7rem] font-extrabold leading-tight [font-stretch:112%]">
              Le shopping en ligne, livré partout au Gabon.
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon className="text-accent-400 size-4 shrink-0" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
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
