import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CITIES, formatDelay } from "@/lib/delivery";
import { formatFCFA } from "@/lib/format";
import { deliveryTariffs } from "@/lib/shipping/tariffs";
import { INFO_PAGES, SITE, type InfoSlug } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

const isInfoSlug = (s: string): s is InfoSlug => Object.hasOwn(INFO_PAGES, s);

export function generateStaticParams() {
  return Object.keys(INFO_PAGES).map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: isInfoSlug(slug) ? INFO_PAGES[slug] : "Page introuvable" };
}

/** Barème en vigueur (S7-T02) : réglé par l'équipe dans l'API, gardé 5 minutes par le site. */
async function DeliveryTable() {
  const zones = await deliveryTariffs();
  return (
    <div className="not-prose overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="bg-ink-50 text-ink-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Zone</th>
            <th className="px-3 py-2 font-semibold">Villes</th>
            <th className="px-3 py-2 font-semibold">Frais</th>
            <th className="px-3 py-2 font-semibold">Gratuite dès</th>
            <th className="px-3 py-2 font-semibold">Délai</th>
          </tr>
        </thead>
        <tbody className="divide-ink-100 divide-y">
          {Object.values(zones).map((z) => (
            <tr key={z.id}>
              <td className="px-3 py-2 font-medium">{z.label}</td>
              <td className="px-3 py-2">
                {CITIES.filter((c) => c.zone === z.id)
                  .map((c) => c.name)
                  .join(", ")}
              </td>
              <td className="px-3 py-2">{z.baseFee === 0 ? "Offerte" : formatFCFA(z.baseFee)}</td>
              <td className="px-3 py-2">{formatFCFA(z.freeThreshold)}</td>
              <td className="px-3 py-2">{formatDelay(z.daysMin, z.daysMax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CONTENT: Record<InfoSlug, React.ReactNode> = {
  "a-propos": (
    <>
      <p>
        {SITE.name} est une plateforme de commerce en ligne gabonaise. Notre mission : rendre le
        shopping en ligne simple, sûr et accessible partout au Gabon, avec des moyens de paiement
        adaptés (Mobile Money) et une livraison fiable, de Libreville à Makokou.
      </p>
    </>
  ),
  contact: (
    <>
      <p>Notre service client est disponible 7j/7, de 8 h à 20 h.</p>
      <ul>
        <li>Téléphone / WhatsApp : {SITE.supportPhone}</li>
        <li>E-mail : {SITE.supportEmail}</li>
      </ul>
    </>
  ),
  "centre-aide": (
    <p>
      Retrouvez bientôt ici les réponses aux questions fréquentes : commande, paiement, livraison,
      retours.
    </p>
  ),
  livraison: (
    <>
      <p>
        Nous livrons dans les principales villes du Gabon. Les frais dépendent de la zone de
        livraison :
      </p>
      <DeliveryTable />
      <p>
        Vous disposez de 14 jours après réception pour retourner un article dans son emballage
        d&apos;origine.
      </p>
    </>
  ),
  paiement: (
    <ul>
      <li>Airtel Money</li>
      <li>Moov Money</li>
      <li>Paiement à la livraison (selon zones)</li>
    </ul>
  ),
  cgv: (
    <p>Les conditions générales de vente seront publiées avant l&apos;ouverture des commandes.</p>
  ),
  confidentialite: (
    <p>
      {SITE.name} collecte uniquement les données nécessaires au traitement de vos commandes,
      conformément à la loi gabonaise n°001/2011 relative à la protection des données à caractère
      personnel. La politique complète sera publiée avant l&apos;ouverture des comptes clients.
    </p>
  ),
  "mentions-legales": (
    <p>Éditeur : {SITE.name} — informations légales (RCCM, NIF, siège) à compléter.</p>
  ),
};

export default async function InfoPage({ params }: Props) {
  const { slug } = await params;
  if (!isInfoSlug(slug)) notFound();
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: INFO_PAGES[slug] }]} />
      <article className="max-w-3xl rounded-xl bg-white p-6 sm:p-10">
        <h1 className="mb-6 text-3xl font-extrabold">{INFO_PAGES[slug]}</h1>
        <div className="text-ink-700 space-y-4 leading-7 [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
          {CONTENT[slug]}
        </div>
      </article>
    </div>
  );
}
