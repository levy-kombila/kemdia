<#
.SYNOPSIS
  Met Kemdia EN LIGNE depuis ce PC, pour des tests à distance (S6-T00, ADR-0031).

.DESCRIPTION
  Docker Desktop doit être lancé. Le script :
    1. lit BREVO_API_KEY et EMAIL_FROM dans le fichier .env à la racine du dépôt (il ne l'écrit JAMAIS) ;
    2. ouvre un tunnel Cloudflare rapide (adresse https://….trycloudflare.com, nouvelle à chaque fois) ;
    3. construit et démarre le site, l'API et une base À PART, comme la démo Render (APP_ENV=demo :
       catalogue de démonstration, code DEMO10, Mobile Money simulé, aucun vrai paiement) ;
    4. vérifie que le site répond par le tunnel, puis affiche l'adresse (et la copie dans le presse-papiers).
  Pour couper l'accès : deploy\windows\hors-ligne.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\en-ligne.ps1
#>
[CmdletBinding()]
param()

$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$Compose = Join-Path $Root 'deploy\en-ligne\compose.yml'
Set-Location $Root

function Fail([string]$Message) {
  Write-Host ''
  Write-Host "ARRÊT : $Message" -ForegroundColor Red
  exit 1
}

function Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function New-Secret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}

# --- 1. Docker Desktop ---------------------------------------------------------------------------
Step 'Vérification de Docker Desktop'
& docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker Desktop ne répond pas. Lance-le, attends « Engine running », puis relance ce script.' }

# --- 2. Clés Brevo, lues dans .env (jamais écrites) ----------------------------------------------
Step 'Lecture des réglages e-mail (Brevo) dans .env'
$settings = @{}
$envFile = Join-Path $Root '.env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
    if ($line -match '^\s*(BREVO_API_KEY|EMAIL_FROM|EMAIL_FROM_NAME)\s*=\s*(.*)$') {
      $settings[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
  }
}
foreach ($name in 'BREVO_API_KEY', 'EMAIL_FROM', 'EMAIL_FROM_NAME') {
  $fromProcess = [Environment]::GetEnvironmentVariable($name)
  if ($fromProcess) { $settings[$name] = $fromProcess }
}
if (-not $settings['BREVO_API_KEY'] -or -not $settings['EMAIL_FROM']) {
  Fail ("BREVO_API_KEY et EMAIL_FROM sont nécessaires (codes d'inscription et factures envoyés aux testeurs).`n" +
        "       Ajoute-les toi-même dans $envFile (mêmes valeurs que sur Render), par exemple :`n" +
        "         BREVO_API_KEY=xkeysib-…`n" +
        "         EMAIL_FROM=adresse-verifiee-dans-brevo@exemple.com")
}
$env:BREVO_API_KEY = $settings['BREVO_API_KEY']
$env:EMAIL_FROM = $settings['EMAIL_FROM']
if ($settings['EMAIL_FROM_NAME']) { $env:EMAIL_FROM_NAME = $settings['EMAIL_FROM_NAME'] }

# --- 3. Secrets de la session --------------------------------------------------------------------
# Mot de passe de la base : fixé à la création du volume, donc gardé d'une fois sur l'autre, HORS du dépôt
$stateDir = Join-Path $env:LOCALAPPDATA 'Kemdia\en-ligne'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$dbPasswordFile = Join-Path $stateDir 'db-password.txt'
if (-not (Test-Path $dbPasswordFile)) { New-Secret | Set-Content -LiteralPath $dbPasswordFile -NoNewline -Encoding ASCII }
$env:KEMDIA_DB_PASSWORD = (Get-Content -LiteralPath $dbPasswordFile -Raw).Trim()
# Clé interne site ↔ API : nouvelle à chaque lancement, jamais écrite sur le disque
$env:KEMDIA_INTERNAL_KEY = New-Secret
$commit = (& git rev-parse --short HEAD 2>$null)
if (-not $commit) { $commit = 'inconnu' }
$env:KEMDIA_VERSION = "en-ligne-$commit"
# Valeur provisoire : la vraie adresse n'est connue qu'une fois le tunnel ouvert
if (-not $env:KEMDIA_SITE_URL) { $env:KEMDIA_SITE_URL = 'https://kemdia.invalid' }

# --- 4. Tunnel Cloudflare ------------------------------------------------------------------------
Step 'Ouverture du tunnel Cloudflare'
& docker compose -f $Compose up -d tunnel
if ($LASTEXITCODE -ne 0) { Fail 'le tunnel ne démarre pas (voir le message ci-dessus).' }
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  $logs = (& docker compose -f $Compose logs --no-color tunnel 2>&1) | Out-String
  $found = [regex]::Matches($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($found.Count -gt 0) { $url = $found[$found.Count - 1].Value } else { Start-Sleep -Seconds 1 }
}
if (-not $url) { Fail "aucune adresse de tunnel après 60 s. Voir : docker compose -f $Compose logs tunnel" }
$env:KEMDIA_SITE_URL = $url
Write-Host "Adresse du tunnel : $url"

# --- 5. Site, API et base ------------------------------------------------------------------------
Step 'Construction et démarrage du site, de l''API et de la base (la première fois : plusieurs minutes)'
& docker compose -f $Compose up -d --build --wait db api web
if ($LASTEXITCODE -ne 0) {
  Fail "le site ou l'API ne démarre pas. Voir : docker compose -f $Compose logs api web"
}

# --- 6. Vérification par le tunnel ---------------------------------------------------------------
Step 'Vérification par Internet (le tunnel peut mettre une minute à répondre)'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ok = $false
for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
  try {
    $res = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 10
    if ($res.StatusCode -eq 200) { $ok = $true }
  } catch { Start-Sleep -Seconds 3 }
}

Write-Host ''
if ($ok) {
  Write-Host "Kemdia est en ligne : $url" -ForegroundColor Green
} else {
  Write-Host "Kemdia démarre, mais le tunnel ne répond pas encore : réessaie $url dans une minute." -ForegroundColor Yellow
}
try { Set-Clipboard -Value $url; Write-Host '(adresse copiée dans le presse-papiers)' } catch { }
Write-Host ''
Write-Host "Mode d'emploi pour tes testeurs : $url/demo"
Write-Host 'Code promo de démonstration : DEMO10 · paiement Mobile Money simulé : /demo/telephone'
Write-Host 'Sur ce PC uniquement : http://localhost:3100'
Write-Host ''
Write-Host 'Pour couper l''accès public : powershell -ExecutionPolicy Bypass -File deploy\windows\hors-ligne.ps1'
Write-Host 'Pense à empêcher la mise en veille du PC pendant les tests.'
