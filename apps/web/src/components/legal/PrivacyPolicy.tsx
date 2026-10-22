import Link from "next/link";
import { LegalValue } from "@/components/legal/LegalValue";
import { LEGAL, RETENTION } from "@/lib/legal";
import { SITE } from "@/lib/site";

/**
 * Politique de confidentialité (S7-T08, loi n°001/2011 modifiée par la loi n°025/2023). Chaque traitement est décrit
 * dans le registre (docs/conformite/registre-traitements.md) : garder les deux à jour ensemble.
 */
export function PrivacyPolicy() {
  return (
    <>
      <p>
        Cette page explique quelles données {SITE.name} collecte, pourquoi, combien de temps elles
        sont gardées et comment exercer vos droits. Elle applique la loi gabonaise n°001/2011
        relative à la protection des données à caractère personnel, modifiée par la loi n°025/2023,
        sous le contrôle de l&apos;APDPVP.
      </p>

      <h2 className="text-xl font-bold">Responsable des traitements</h2>
      <p>
        <LegalValue value={LEGAL.company} />, <LegalValue value={LEGAL.headOffice} />. Délégué à la
        protection des données : <LegalValue value={LEGAL.dpo} />. Contact pour vos droits :{" "}
        <LegalValue value={LEGAL.privacyEmail} />.
      </p>

      <h2 className="text-xl font-bold">Les données et leur usage</h2>
      <ul>
        <li>
          <strong>Votre compte</strong> : prénom, nom, e-mail ou mobile, mot de passe (jamais en
          clair : seule une empreinte Argon2id est gardée), dates d&apos;acceptation des conditions
          et de confirmation « 18 ans ou plus ». But : vous identifier et sécuriser votre compte.
        </li>
        <li>
          <strong>Vos commandes</strong> : articles, montants, adresse et téléphone de livraison,
          numéro Mobile Money utilisé. But : préparer, livrer, encaisser, rembourser et facturer.
        </li>
        <li>
          <strong>Votre boutique</strong> (vendeurs) : nom de la boutique, mobile de contact,
          dossier de vérification (pièce d&apos;identité, RCCM). But : vérifier les vendeurs et
          protéger les clients.
        </li>
        <li>
          <strong>Sécurité</strong> : appareils connectés (navigateur), adresse IP et journal des
          actions sensibles. But : détecter les fraudes et les accès non autorisés.
        </li>
      </ul>
      <p>
        {SITE.name} ne vend pas vos données, ne fait pas de publicité ciblée et n&apos;envoie pas de
        lettre d&apos;information sans votre accord. Kemdia est réservé aux personnes de 18 ans ou
        plus.
      </p>

      <h2 className="text-xl font-bold">Durées de conservation</h2>
      <ul>
        <li>
          Compte : tant que vous l&apos;utilisez. Sans connexion pendant {RETENTION.inactiveYears}{" "}
          ans, il est supprimé ; vous êtes prévenu par e-mail {RETENTION.noticeDays} jours avant.
        </li>
        <li>
          Commandes et factures : {RETENTION.invoiceYears} ans (obligation comptable OHADA). Si vous
          supprimez votre compte, les commandes restent sans votre nom, vos téléphones ni votre
          adresse de livraison. Les factures, elles, ne peuvent pas être modifiées : elles sont
          gardées telles qu&apos;elles ont été émises (nom, téléphone et adresse de
          l&apos;acheteur), pour la seule comptabilité.
        </li>
        <li>Photos des pièces d&apos;identité des vendeurs : 30 jours après la décision.</li>
        <li>
          Journal des actions sensibles (connexions, changements de mot de passe, décisions de
          l&apos;équipe, avec l&apos;adresse IP et parfois une courte note de l&apos;équipe) : 1 an,
          même après la suppression du compte.
        </li>
        <li>Sessions de connexion : 30 jours, prolongés à chaque visite.</li>
        <li>
          Appareils déjà utilisés pour vous connecter : une empreinte de l&apos;identifiant (jamais
          l&apos;identifiant lui-même) et le résumé du navigateur ; oubliés après un an sans
          connexion, et effacés avec le compte. Ils figurent dans la copie de vos données.
        </li>
        <li>
          Sauvegardes chiffrées : 6 mois au plus ; une donnée effacée disparaît des sauvegardes à
          leur rotation.
        </li>
      </ul>

      <h2 className="text-xl font-bold">Qui reçoit vos données</h2>
      <ul>
        <li>
          L&apos;équipe {SITE.name}, selon son rôle (catalogue, logistique, finance, service client,
          administration).
        </li>
        <li>Le vendeur de vos articles : ce qu&apos;il faut pour préparer sa part de commande.</li>
        <li>Le livreur : nom, téléphone et adresse de livraison.</li>
        <li>L&apos;opérateur Mobile Money (Airtel, Moov) : le numéro et le montant à payer.</li>
        <li>Brevo (France) : votre adresse e-mail, pour vous envoyer codes, avis et factures.</li>
      </ul>
      <p>
        Certaines données sont hébergées hors du Gabon (hébergeur :{" "}
        <LegalValue value={LEGAL.productionHost} /> ; envoi des e-mails en France). Ces transferts
        sont déclarés à l&apos;APDPVP.
      </p>

      <h2 className="text-xl font-bold">Cookies et stockage du navigateur</h2>
      <p>
        {SITE.name} n&apos;utilise{" "}
        <strong>aucun cookie publicitaire ni de mesure d&apos;audience</strong>. Seuls des éléments
        strictement nécessaires sont utilisés, sans consentement préalable :
      </p>
      <ul>
        <li>
          Cookie de session (connexion, 30 jours) et cookies temporaires d&apos;inscription et de
          mot de passe oublié (quelques minutes).
        </li>
        <li>
          Cookie d&apos;appareil (<code>kemdia_appareil</code>, un an, renouvelé à chaque connexion)
          : un nombre tiré au hasard, pour vous prévenir par e-mail quand votre compte est ouvert
          depuis un appareil inconnu. Il ne sert à rien d&apos;autre.
        </li>
        <li>
          Stockage du navigateur : panier (<code>kemdia.cart.v2</code>), favoris (
          <code>kemdia.favorites.v1</code>) et ville de livraison choisie (
          <code>kemdia.location.v1</code>). Ils restent sur votre appareil.
        </li>
        <li>
          Cookie de la ville de livraison choisie (<code>kemdia_ville</code>, un an) : la ville
          seule, jamais le quartier, pour montrer d&apos;abord les boutiques proches à prix égal.
        </li>
      </ul>

      <h2 className="text-xl font-bold">Vos droits</h2>
      <p>
        Vous pouvez à tout moment accéder à vos données, les faire corriger, les récupérer
        (portabilité), vous opposer à un traitement ou demander leur effacement.
      </p>
      <ul>
        <li>
          Depuis{" "}
          <Link href="/compte" className="text-brand-700 font-semibold underline">
            Mon compte
          </Link>
          , section « Mes données » : télécharger une copie de vos données, ou supprimer votre
          compte (effet immédiat).
        </li>
        <li>
          Pour toute autre demande : écrivez à <LegalValue value={LEGAL.privacyEmail} /> (ou{" "}
          {SITE.supportEmail}). Réponse sous 30 jours au plus ; une preuve d&apos;identité peut être
          demandée.
        </li>
        <li>
          Si vous n&apos;êtes pas satisfait de notre réponse, vous pouvez saisir l&apos;APDPVP.
        </li>
      </ul>

      <h2 className="text-xl font-bold">Sécurité et incidents</h2>
      <p>
        Connexions chiffrées (HTTPS), mots de passe hachés, pièces d&apos;identité chiffrées, double
        authentification pour l&apos;équipe, sauvegardes chiffrées. En cas de fuite de données
        présentant un risque pour vous, l&apos;APDPVP et les personnes concernées sont prévenues
        sans délai excessif.
      </p>
    </>
  );
}
