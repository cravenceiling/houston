# Create a throwaway Houston "home" with one workspace + one agent, so you can
# try the TypeScript engine without touching your real %USERPROFILE%\.houston.
#
#   $env:HOUSTON_HOME = "$env:TEMP\houston-ts-demo"
#   powershell -ExecutionPolicy Bypass -File packages\engine\scripts\scratch-home.ps1
$ErrorActionPreference = "Stop"
$homeDir = if ($env:HOUSTON_HOME) { $env:HOUSTON_HOME } else { Join-Path $env:TEMP "houston-ts-demo" }
$ag = Join-Path $homeDir "workspaces\Personal\Buddy"
New-Item -ItemType Directory -Force -Path (Join-Path $ag ".houston\config")   | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ag ".houston\activity") | Out-Null

# JSON files MUST be written without a UTF-8 BOM (the engine JSON.parses them).
function Write-NoBom($path, $text) { [System.IO.File]::WriteAllText($path, $text) }

Write-NoBom (Join-Path $homeDir "workspaces\workspaces.json") '[{"id":"ws-1","name":"Personal","isDefault":true,"createdAt":"2026-01-01T00:00:00Z"}]'
Write-NoBom (Join-Path $ag ".houston\agent.json") '{"id":"agent-1","name":"Buddy","config_id":"blank","color":"forest","created_at":"2026-01-01T00:00:00Z","last_opened_at":"2026-01-01T00:00:00Z"}'
Write-NoBom (Join-Path $ag ".houston\config\config.json") '{"name":"Buddy","provider":"anthropic","model":"sonnet"}'
Write-NoBom (Join-Path $ag ".houston\activity\activity.json") '[]'
Write-NoBom (Join-Path $ag "CLAUDE.md") "# Buddy`r`n"

Write-Host "Scratch Houston home ready at: $homeDir"
Write-Host "  workspace 'Personal' (id ws-1) with agent 'Buddy' (anthropic/sonnet)"
