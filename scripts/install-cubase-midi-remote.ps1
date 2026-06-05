param(
  [string]$CubaseFolder = "Cubase"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot "cubase_remote\Local\ToneLink\ToneLink_App"
$target = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Steinberg\$CubaseFolder\MIDI Remote\Driver Scripts\Local\ToneLink\ToneLink_App"

if (-not (Test-Path $source)) {
  throw "Source MIDI Remote script folder not found: $source"
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $source "*") -Destination $target -Force

Write-Host "Installed Cubase MIDI Remote script to:"
Write-Host $target
Write-Host ""
Write-Host "Open Cubase > MIDI Remote > Scripting Tools > Reload Scripts, then select 'ToneLink / ToneLink App'."
