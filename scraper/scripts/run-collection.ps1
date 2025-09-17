$ErrorActionPreference = 'Stop'

param(
  [string]$Depth = '2',
  [int]$ExitOnInactivityMinutes = 15
)

try {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $scraperRoot = Split-Path -Parent $scriptDir

  if (-not (Test-Path (Join-Path $scraperRoot 'gmaps-input.txt'))) {
    throw "Arquivo gmaps-input.txt não encontrado em $scraperRoot"
  }

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $resultJson = Join-Path $scraperRoot "results-$timestamp.json"

  Write-Host "[1/3] Executando coleta via Docker (depth=$Depth, inactivity=${ExitOnInactivityMinutes}m)..."
  $dockerCmd = @(
    'docker run --rm',
    "-v `"$scraperRoot:/work`"",
    'gosom/google-maps-scraper',
    '-input /work/gmaps-input.txt',
    '-json',
    "-results /work/$(Split-Path -Leaf $resultJson)",
    '-extra-reviews',
    "-depth $Depth",
    "-exit-on-inactivity ${ExitOnInactivityMinutes}m",
    '-lang pt'
  ) -join ' '
  Write-Host $dockerCmd
  cmd /c $dockerCmd

  if (-not (Test-Path $resultJson)) {
    throw "Arquivo de resultados não gerado: $resultJson"
  }

  Write-Host "[2/3] Importando resultados no Supabase..."
  node (Join-Path $scriptDir 'import-extractor-results.mjs') $resultJson

  Write-Host "[3/3] Concluído. Arquivo: $resultJson"
}
catch {
  Write-Error $_
  exit 1
}


