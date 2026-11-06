$ErrorActionPreference = "Stop"

$pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonLauncher -and -not $pythonCommand) {
  Write-Host "Python não foi encontrado. Instale o Python ou abra o PowerShell nesta pasta e execute: python -m http.server 8000 --bind 0.0.0.0"
  Read-Host "Pressione Enter para fechar"
  exit 1
}

$network = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1
$address = if ($network) { $network.IPv4Address[0].IPAddress } else { "<IP-DO-COMPUTADOR>" }

Write-Host "No celular, conectado ao mesmo Wi-Fi, abra: http://${address}:8000"
Write-Host "O servidor ficará ativo enquanto esta janela estiver aberta. Encerre com Ctrl+C."
Write-Host ""
Set-Location -LiteralPath $PSScriptRoot
if ($pythonLauncher) { & py -m http.server 8000 --bind 0.0.0.0 }
else { & python -m http.server 8000 --bind 0.0.0.0 }
