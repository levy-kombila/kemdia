import Link from "next/link";
import { LegalValue } from "@/components/legal/LegalValue";
import { LEGAL } from "@/lib/legal";
import { SITE } from "@/lib/site";

/** Mentions légales (S7-T08). Les champs vides restent « à compléter » (question ouverte n°10). */
export function LegalNotice() {
  return (
    <>
      <h2 className="text-xl font-bold">Éditeur du site</h2>
      <ul>
        <li>
          Raison sociale : <LegalValue value={LEGAL.company} />
        </li>
        <li>
          Siège social : <LegalValue value={LEGAL.headOffice} />
        </li>
        <li>
          RCCM : <LegalValue value={LEGAL.rccm} /> — NIF : <LegalValue value={LEGAL.nif} />
        </li>
        <li>
          Directeur de la publication : <LegalValue value={LEGAL.publisher} />
        </li>
        <li>
          Contact : {SITE.supportEmail} — {SITE.supportPhone}
        </li>
      </ul>
      <h2 className="text-xl font-bold">Hébergement</h2>
      <p>
        Site et données : <LegalValue value={LEGAL.productionHost} />. Les e-mails (codes de
        connexion, factures, avis) sont envoyés par Brevo (Sendinblue SAS, France).
      </p>
      <h2 className="text-xl font-bold">Données personnelles</h2>
      <p>
        {SITE.name} respecte la loi gabonaise n°001/2011 relative à la protection des données à
        caractère personnel, modifiée par la loi n°025/2023, sous le contrôle de l&apos;Autorité de
        Protection des Données à caractère Personnel et de la Vie Privée (APDPVP). Déclaration :{" "}
        <LegalValue value={LEGAL.apdpvpReceipt} />. Pour tout savoir sur vos données et vos droits,
        lisez notre{" "}
        <Link href="/infos/confidentialite" className="text-brand-700 font-semibold underline">
          politique de confidentialité
        </Link>
        .
      </p>
    </>
  );
}
