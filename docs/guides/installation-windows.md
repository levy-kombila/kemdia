# Installer le poste de développement — Windows 10 / 11

Temps estimé : 30 à 45 minutes. Toutes les commandes se tapent dans **PowerShell** (clic droit sur Démarrer → _Terminal_).

> 💡 Vous avez déjà VS Code et pyenv sur votre machine : on ne touche pas à Python, il peut rester installé.

## 1. Git

```powershell
winget install --id Git.Git -e
```

Fermez puis rouvrez le terminal, puis configurez votre identité :

```powershell
git --version
git config --global user.name "Votre Nom"
git config --global user.email "votre-email@exemple.com"
git config --global core.autocrlf input   # garde des fins de ligne Unix dans le dépôt
git config --global init.defaultBranch main
```

## 2. Node.js 22 LTS (via fnm, gestionnaire de versions)

```powershell
winget install Schniz.fnm
```

Ajoutez fnm à PowerShell (une seule fois) :

```powershell
if (!(Test-Path $PROFILE)) { New-Item -Path $PROFILE -Force }
Add-Content $PROFILE 'fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression'
```

Si PowerShell refuse d'exécuter le profil : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
Rouvrez le terminal, puis :

```powershell
fnm install 22
fnm default 22
node -v    # doit afficher v22.x
```

## 3. pnpm (gestionnaire de paquets)

```powershell
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm -v    # 10.28.0
```

Si `corepack enable` échoue (droits), utilisez : `npm install -g pnpm@10.28.0`.

## 4. VS Code et extensions

```powershell
winget install Microsoft.VisualStudioCode   # si pas déjà installé
```

À l'ouverture du projet, VS Code propose les extensions recommandées (`.vscode/extensions.json`) :
ESLint, Prettier, Tailwind CSS IntelliSense, Vitest, Docker, GitHub Actions → **Installer tout**.

## 5. Docker Desktop (facultatif au Sprint 1, nécessaire à partir du Sprint 3)

```powershell
winget install Docker.DockerDesktop
```

Redémarrez Windows. Docker Desktop active WSL 2 automatiquement ; acceptez les invites.

## 6. GitHub

1. Créez un compte sur <https://github.com> si nécessaire et activez la **double authentification**.
2. Installez le CLI : `winget install GitHub.cli` puis `gh auth login`.
3. Créez le dépôt **privé** `kemdia`.

## 7. Récupérer et lancer le projet

Décompressez l'archive `kemdia` (par ex. dans `C:\Users\<vous>\Projets\kemdia`), puis :

```powershell
cd C:\Users\<vous>\Projets\kemdia
git init                                   # si l'archive ne contient pas .git
pnpm install
copy apps\web\.env.example apps\web\.env.local
pnpm dev
```

Ouvrez <http://localhost:3000> 🎉

Premier envoi vers GitHub :

```powershell
git add .
git commit -m "chore: S1 fondations frontend Kemdia"
git remote add origin https://github.com/<votre-compte>/kemdia.git
git push -u origin main
```

Les workflows CI et Sécurité se lancent automatiquement (onglet **Actions** du dépôt).

## 8. Commandes utiles

| Commande                                            | Effet                                              |
| --------------------------------------------------- | -------------------------------------------------- |
| `pnpm dev`                                          | Serveur de développement avec rechargement à chaud |
| `pnpm test`                                         | Tests unitaires et composants                      |
| `pnpm lint`                                         | Analyse du code                                    |
| `pnpm typecheck`                                    | Vérification des types                             |
| `pnpm format`                                       | Mise en forme automatique                          |
| `pnpm build` puis `pnpm --filter @kemdia/web start` | Version de production en local                     |
| `docker compose up --build`                         | Lancer l'image Docker de production                |

## 9. Réglages GitHub recommandés (une fois le dépôt créé)

_Settings → Branches → Add rule_ pour `main` :

- ✅ Require a pull request before merging
- ✅ Require status checks to pass : `Lint · Types · Tests · Build`, `Détection de secrets (Gitleaks)`, `Audit des dépendances (pnpm audit)`, `Analyse statique (CodeQL)`
- ✅ Do not allow bypassing the above settings

_Settings → Code security_ : activez **Dependabot alerts**, **Secret scanning** et **Push protection**.

## Problèmes fréquents

| Symptôme                        | Solution                                                 |
| ------------------------------- | -------------------------------------------------------- |
| `pnpm` introuvable              | Rouvrir le terminal ; sinon `npm i -g pnpm@10.28.0`      |
| `node` en mauvaise version      | `fnm use 22` dans le dossier du projet                   |
| Port 3000 occupé                | `pnpm dev -- -p 3001`                                    |
| Erreurs de fins de ligne (CRLF) | `git config --global core.autocrlf input` puis re-cloner |
