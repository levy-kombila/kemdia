# Guide — Envoi des e-mails (codes de vérification)

L'API envoie trois sortes d'e-mails : le **code à 6 chiffres** (inscription et mot de passe oublié),
l'**alerte** « quelqu'un a essayé de s'inscrire avec votre adresse », et l'**avis** « votre mot de passe a été modifié ».
Une adresse sans compte qui demande « mot de passe oublié » ne reçoit **rien**.
Décisions : [ADR-0016](../architecture/adr/0016-inscription-tickets-emails.md), [ADR-0018](../architecture/adr/0018-mot-de-passe-oublie.md).

Le réglage `EMAIL_TRANSPORT` choisit le moyen d'envoi :

| Valeur    | Où                                  | Ce qui se passe                                                                        |
| --------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| `console` | Poste de développement (par défaut) | Le code s'affiche dans le terminal de l'API (`pnpm dev`)                               |
| `mailpit` | Poste de développement              | L'e-mail arrive dans **Mailpit**, une fausse boîte aux lettres : http://localhost:8025 |
| `brevo`   | Démo Render                         | Vrai e-mail envoyé par Brevo (gratuit, 300 par jour)                                   |
| `none`    | Partout ailleurs (par défaut)       | Aucun envoi : l'inscription répond « envoi indisponible »                              |

`console` est **refusé** hors du poste de développement : un code dans les journaux d'un serveur, c'est un compte volé.

## 1. Sur ton poste

### Sans rien installer (par défaut)

Lance l'API (`pnpm --filter @kemdia/api dev`), inscris-toi : le terminal affiche une ligne
`[email] ton@adresse — code inscription : 123456`.

### Avec Mailpit (pour voir les vrais e-mails)

1. `docker compose up -d mailpit`
2. Ouvre http://localhost:8025 (accessible seulement depuis ton poste).
3. Pour que `pnpm dev` envoie à Mailpit, il faut ajouter `EMAIL_TRANSPORT=mailpit` dans `apps/api/.env`.
   > Ce fichier t'appartient : je ne le modifie pas sans ton accord. Commande (ajoute une ligne, ne remplace rien) :
   >
   > ```powershell
   > Add-Content apps\api\.env "EMAIL_TRANSPORT=mailpit"
   > ```
   >
   > Pour revenir à la console : supprime cette ligne.
4. Avec `docker compose up --build` (tout en conteneurs), l'API envoie déjà à Mailpit : rien à régler.

## 2. Sur la démo : Brevo, pas à pas

Render gratuit bloque l'envoi SMTP : l'API utilise l'**API web** de Brevo. Compte gratuit, sans carte bancaire.

### Étape A — Créer le compte Brevo

1. Va sur https://www.brevo.com → **S'inscrire gratuitement**.
2. Utilise une adresse que tu consultes (elle recevra un e-mail de confirmation).
3. Remplis le profil demandé (nom, société : « Kemdia », pays : Gabon). Choisis l'offre **Free**.
4. Brevo peut vérifier ton compte avant d'autoriser les envois (quelques minutes à un jour). Attends l'e-mail de confirmation.

### Étape B — Déclarer l'adresse d'expédition

1. Menu (en haut à droite, ton nom) → **Expéditeurs, domaines et IP dédiées** → **Expéditeurs** → **Ajouter un expéditeur**.
2. Nom : `Kemdia` ; adresse : celle qui apparaîtra comme expéditeur (par exemple ta Gmail, ou une adresse créée pour la démo).
3. Brevo envoie un **code** à cette adresse : saisis-le. L'expéditeur passe à « vérifié ».

> Sans nom de domaine à nous, certains e-mails peuvent arriver dans les **indésirables** : pense à y regarder pendant les essais.

### Étape C — Créer la clé d'API

1. Menu → **SMTP et API** → onglet **Clés API** → **Générer une nouvelle clé API**.
2. Nom : `kemdia-demo`. Copie la clé (elle commence par `xkeysib-`) : **Brevo ne la montre qu'une fois**.
3. Cette clé est un **secret** : ne la colle ni dans Git, ni dans un message, ni dans une capture d'écran.
   Si elle fuit : supprime-la dans Brevo et crée-en une autre.

### Étape D — Ajouter les réglages sur Render (service de l'API)

> Je t'explique d'abord ce que chaque réglage change ; tu les ajoutes toi-même, quand tu es prêt.

Render → service **kemdia-api** → **Environment** → **Add Environment Variable**, trois variables :

| Nom               | Valeur                         | Ce que ça change                                             |
| ----------------- | ------------------------------ | ------------------------------------------------------------ |
| `EMAIL_TRANSPORT` | `brevo`                        | L'API envoie les codes par Brevo (sans elle : aucun envoi)   |
| `BREVO_API_KEY`   | la clé de l'étape C            | **Secret** — permet à l'API d'utiliser ton compte Brevo      |
| `EMAIL_FROM`      | l'adresse vérifiée à l'étape B | Adresse d'expédition ; Brevo refuse une adresse non vérifiée |

Puis **Save Changes** : Render redémarre l'API (≈ 1 min).
Si une valeur est fausse, l'API **refuse de démarrer** et les journaux Render nomment la variable en cause, sans afficher sa valeur.

### Étape E — Vérifier

Tant que le site n'est pas branché sur l'API (S4-T05), on vérifie directement par l'API (PowerShell) :

```powershell
$corps = @{ firstName = "Essai"; lastName = "Demo"; identifier = "TON-ADRESSE@gmail.com"; password = "Mangue2026"; acceptTerms = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri https://kemdia-api.onrender.com/api/v1/auth/signup -ContentType "application/json" -Body $corps
```

Réponse attendue : `channel : email`, `sentTo : TO•••@gmail.com`, et l'e-mail « Votre code de vérification Kemdia » arrive (regarde aussi les indésirables).

| Réponse                                  | Signification                                                    |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `CANAL_INDISPONIBLE`                     | `EMAIL_TRANSPORT` n'est pas `brevo` (ou l'API n'a pas redémarré) |
| `ENVOI_TROP_RAPPROCHE` / `TROP_D_ENVOIS` | Limites normales : 60 s entre deux codes, 5 par heure            |

**La réponse est bonne mais l'e-mail n'arrive pas ?** L'e-mail part après la réponse : un refus de Brevo ne se voit que dans
les **journaux Render** du service de l'API, sous la forme `envoi email vers to•••@gmail.com impossible : Brevo : réponse HTTP 401`
(401 : clé fausse ; 400 : expéditeur non vérifié ; 403 : compte Brevo pas encore validé) — jamais la clé ni le contenu de l'e-mail.
Regarde aussi les indésirables.

## Limites de l'offre gratuite Brevo

300 e-mails par jour, logo Brevo possible en bas des e-mails marketing (pas des e-mails transactionnels), copie des e-mails gardée par Brevo.
Pour la production : nom de domaine Kemdia, SPF/DKIM/DMARC, et choix du fournisseur avec le client (S7).
