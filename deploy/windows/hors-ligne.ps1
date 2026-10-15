<#
.SYNOPSIS
  Coupe l'accès public à Kemdia (S6-T00, ADR-0031).

.DESCRIPTION
  Ferme d'abord le tunnel (plus personne ne peut entrer), puis arrête le site, l'API et la base du mode en ligne.
  Les comptes et commandes des testeurs sont GARDÉS pour la prochaine fois.
  Avec -Effacer : supprime aussi la base du mode en ligne (comptes, commandes, factures des testeurs).
  Ta base de développement n'est jamais touchée.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\hors-ligne.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\hors-ligne.ps1 -Effacer
#>
[CmdletBinding()]
param([switch]$Effacer)

$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$Compose = Join-Path $Root 'deploy\en-ligne\compose.yml'
Set-Location $Root

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Docker Desktop ne répond pas : rien ne tourne en ligne (ou lance Docker Desktop puis relance ce script).' -ForegroundColor Yellow
  exit 1
}

# Valeurs factices : Compose lit tout le fichier même pour arrêter (rien n'est reconstruit ni recréé)
foreach ($name in 'KEMDIA_VERSION', 'KEMDIA_SITE_URL', 'KEMDIA_INTERNAL_KEY', 'KEMDIA_DB_PASSWORD', 'BREVO_API_KEY', 'EMAIL_FROM') {
  if (-not [Environment]::GetEnvironmentVariable($name)) { Set-Item -Path "env:$name" -Value 'arret' }
}

Write-Host '==> Fermeture du tunnel (plus d''accès depuis Internet)' -ForegroundColor Cyan
& docker compose -f $Compose stop tunnel
if ($LASTEXITCODE -ne 0) { Write-Host 'ATTENTION : le tunnel ne s''est pas arrêté. Vérifie dans Docker Desktop (projet kemdia-en-ligne).' -ForegroundColor Red; exit 1 }

if ($Effacer) {
  Write-Host '==> Arrêt et suppression du mode en ligne, base des testeurs comprise' -ForegroundColor Cyan
  & docker compose -f $Compose down -v
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'ATTENTION : la base n''a pas pu être supprimée ; son mot de passe est gardé.' -ForegroundColor Red
    exit 1
  }
  # Seulement une fois la base supprimée : sinon le prochain lancement ne pourrait plus s'y connecter
  $stateFile = Join-Path $env:LOCALAPPDATA 'Kemdia\en-ligne\db-password.txt'
  if (Test-Path $stateFile) { Remove-Item -LiteralPath $stateFile }
} else {
  Write-Host '==> Arrêt du site, de l''API et de la base du mode en ligne (données gardées)' -ForegroundColor Cyan
  & docker compose -f $Compose stop
}
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ''
Write-Host 'Kemdia est hors ligne : l''adresse trycloudflare.com ne répond plus.' -ForegroundColor Green
if (-not $Effacer) { Write-Host 'Les données des testeurs sont gardées. Pour tout effacer : hors-ligne.ps1 -Effacer' }
