import {
  DEMO_COUPON,
  MAX_OPEN_ORDERS,
  MAX_PAYMENT_ATTEMPTS,
  PAYMENT_WINDOW_MINUTES,
  SANDBOX_BALANCE,
} from "@kemdia/contracts/constants";
import { COD_MAX_TOTAL } from "@kemdia/contracts/delivery";
import { FileText, FlaskConical, ShoppingCart, Smartphone, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatFCFA } from "@/lib/format";
import { sandboxPageEnabled } from "@/lib/payments/sandbox";

export const metadata: Metadata = {
  title: "Tester un achat (démonstration)",
  robots: { index: false, follow: false },
};

const STEPS = [
  {
    icon: UserPlus,
    title: "Créez un compte",
    body: (
      <>
        Commander demande un compte.{" "}
        <Link href="/inscription" className="text-brand-700 font-semibold underline">
          Inscrivez-vous
        </Link>{" "}
        avec une adresse e-mail que vous lisez : le code de vérification y est envoyé.
      </>
    ),
  },
  {
    icon: ShoppingCart,
    title: "Ajoutez des articles et commandez",
    body: (
      <>
        Indiquez une adresse à Libreville (n&apos;importe quel repère). Essayez le code promo{" "}
        <strong className="font-price tracking-wide">{DEMO_COUPON.code}</strong> : −
        {DEMO_COUPON.percent} %, {formatFCFA(DEMO_COUPON.maxDiscount)} au plus, une fois par compte.
        Le paiement à la livraison est proposé jusqu&apos;à {formatFCFA(COD_MAX_TOTAL)} (valeur
        provisoire).
      </>
    ),
  },
  {
    icon: Smartphone,
    title: "Payez par Mobile Money… simulé",
    body: (
      <>
        Choisissez Airtel Money (numéro en 07…) ou Moov Money (06…) : un numéro fictif suffit.
        Ouvrez ensuite le{" "}
        <Link href="/demo/telephone" className="text-brand-700 font-semibold underline">
          téléphone simulé
        </Link>{" "}
        dans un autre onglet, saisissez un code PIN de 4 chiffres (n&apos;importe lequel) et
        validez. Pour voir un échec : « Refuser », ou une commande de plus de{" "}
        {formatFCFA(SANDBOX_BALANCE)} (solde fictif insuffisant).
      </>
    ),
  },
  {
    icon: FileText,
    title: "Suivez la commande, téléchargez la facture",
    body: (
      <>
        La page de la commande se met à jour toute seule. Une fois payée, la facture est dans{" "}
        <Link href="/compte/commandes" className="text-brand-700 font-semibold underline">
          Mes commandes
        </Link>{" "}
        (en PDF) et dans votre boîte e-mail. Vous pouvez aussi annuler une commande pas encore
        payée.
      </>
    ),
  },
];

/**
 * Mode d'emploi de la démo (S5-T08, ADR-0030) : le parcours du premier achat en 4 étapes. Existe seulement là où le
 * bac à sable existe (poste de développement, tests, démo) ; sinon 404. Non indexée.
 */
export default function DemoPage() {
  if (!sandboxPageEnabled()) notFound();
  return (
    <div className="container-page py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="rounded-xl bg-white p-6 sm:p-8">
          <FlaskConical className="text-brand-600 size-10" aria-hidden />
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Tester un achat</h1>
          <p className="text-ink-700 mt-2">
            Ceci est un site de démonstration : les produits sont fictifs et{" "}
            <strong>aucun argent ne circule</strong>. Vous pouvez faire un achat complet, du panier
            à la facture.
          </p>
        </header>

        <ol className="space-y-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex gap-4 rounded-xl bg-white p-5">
              <span className="bg-brand-50 text-brand-700 grid size-10 shrink-0 place-items-center rounded-full font-extrabold">
                {i + 1}
              </span>
              <div>
                <h2 className="flex items-center gap-2 text-lg font-extrabold">
                  <Icon className="text-ink-500 size-5" aria-hidden /> {title}
                </h2>
                <p className="text-ink-700 mt-1 text-sm">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section aria-labelledby="bon-a-savoir" className="rounded-xl bg-white p-5 text-sm">
          <h2 id="bon-a-savoir" className="text-lg font-extrabold">
            Bon à savoir
          </h2>
          <ul className="text-ink-700 mt-2 list-disc space-y-1 pl-5">
            <li>
              La démo s&apos;endort quand personne ne l&apos;utilise : le premier chargement peut
              prendre jusqu&apos;à une minute.
            </li>
            <li>
              Une commande Mobile Money doit être payée dans les {PAYMENT_WINDOW_MINUTES} minutes (
              {MAX_PAYMENT_ATTEMPTS} essais au plus), sinon elle est annulée.
            </li>
            <li>{MAX_OPEN_ORDERS} commandes en cours au plus par compte.</li>
          </ul>
        </section>

        <Link
          href="/"
          className="bg-brand-600 hover:bg-brand-700 inline-block rounded-full px-6 py-3 font-semibold text-white"
        >
          Commencer mes achats
        </Link>
      </div>
    </div>
  );
}
