param(
  [int]$Port = 5173
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:$Port/"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found on PATH. Install Node.js or launch the project with a shell where npm is available."
}

Write-Host "Starting Vite dev server for $root at $url"
Start-Process $url
npm run dev -- --host 0.0.0.0 --port $Port
