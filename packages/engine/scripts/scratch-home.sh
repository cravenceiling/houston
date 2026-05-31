#!/usr/bin/env bash
# Create a throwaway Houston "home" with one workspace + one agent, so you can
# try the TypeScript engine without touching your real ~/.houston.
#
#   export HOUSTON_HOME=/tmp/houston-ts-demo
#   bash packages/engine/scripts/scratch-home.sh
set -euo pipefail
HOME_DIR="${HOUSTON_HOME:-/tmp/houston-ts-demo}"
AG="$HOME_DIR/workspaces/Personal/Buddy"
mkdir -p "$AG/.houston/config" "$AG/.houston/activity"
printf '%s\n' '[{"id":"ws-1","name":"Personal","isDefault":true,"createdAt":"2026-01-01T00:00:00Z"}]' > "$HOME_DIR/workspaces/workspaces.json"
printf '%s\n' '{"id":"agent-1","name":"Buddy","config_id":"blank","color":"forest","created_at":"2026-01-01T00:00:00Z","last_opened_at":"2026-01-01T00:00:00Z"}' > "$AG/.houston/agent.json"
printf '%s\n' '{"name":"Buddy","provider":"anthropic","model":"sonnet"}' > "$AG/.houston/config/config.json"
printf '%s\n' '[]' > "$AG/.houston/activity/activity.json"
printf '%s\n' '# Buddy' > "$AG/CLAUDE.md"
echo "Scratch Houston home ready at: $HOME_DIR"
echo "  workspace 'Personal' (id ws-1) with agent 'Buddy' (anthropic/sonnet)"
