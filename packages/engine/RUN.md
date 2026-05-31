# Running the TypeScript engine — step by step

No-assumptions guide. Run everything from the **repo root** (the folder with
`app/`, `engine/`, `packages/`).

- **Windows 11** → use the PowerShell commands below.
- macOS / Linux → see the [bash section](#macos--linux-bash) at the bottom.

---

# Windows (PowerShell)

## 0. One-time setup

Install Bun (the runtime the engine uses):

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

**Close and reopen PowerShell** so `bun` is on your PATH, then:

```powershell
pnpm install
git checkout worktree-ts-engine
```

## Path A — a real Claude reply in your terminal (needs an API key, no app)

Fastest way to confirm a real model turn works. You need an Anthropic **API key**
(`sk-ant-...` from console.anthropic.com).

```powershell
# 1. throwaway home with one agent (won't touch your real ~/.houston)
$env:HOUSTON_HOME = "$env:TEMP\houston-ts-demo"
powershell -ExecutionPolicy Bypass -File packages\engine\scripts\scratch-home.ps1

# 2. sanity check (no key needed — uses a fake model)
bun run packages/engine/core/scripts/verify.ts          # prints VERIFY_OK

# 3. a REAL Claude turn (uses your key)
$env:ANTHROPIC_API_KEY = "sk-ant-...your-key..."
bun run packages/engine/core/scripts/real-turn.ts "Write a haiku about engines and save it to poem.txt"
```

You'll watch Claude stream its reply and create `poem.txt` in the scratch agent
folder (`%TEMP%\houston-ts-demo\workspaces\Personal\Buddy\`).

## Path B — the real desktop app, "Sign in with Anthropic" (your subscription)

Uses the browser sign-in (no API key) with your real `%USERPROFILE%\.houston`.

```powershell
# 1. build the engine into a single .exe
bun build --compile packages/engine/server/src/main.ts --outfile packages\engine\server\dist\houston-engine.exe

# 2. launch the desktop app pointed at it
$env:HOUSTON_ENGINE_BIN = "$PWD\packages\engine\server\dist\houston-engine.exe"
pnpm --dir app tauri dev
```

In the app: it boots against the TS engine → open provider settings → **Sign in
with Anthropic** → approve in the browser → start a mission and chat.

> Rebuilt the engine? Re-run step 1 and restart the app — the .exe is a snapshot.

---

## What works vs. what doesn't (yet)

**Works:** boot/handshake, workspaces + agents, file browser with live updates,
board missions, **real Claude chat** (Path A via key, Path B via OAuth login),
OAuth login for Claude + Codex.

**Not yet (empty/erroring in the app):** routines, store, skills, Composio,
conversations list, worktrees, attachments, and **chatting through a Codex
(ChatGPT) subscription** — Codex *login* works, the turn needs a follow-up. See
`packages/engine/README.md`.

## Troubleshooting (Windows)

- **`bun` not found** → reopen PowerShell after installing Bun.
- **running `.ps1` is blocked** → use the `powershell -ExecutionPolicy Bypass
  -File ...` form shown above.
- **"No Anthropic auth found"** from `real-turn.ts` → set `ANTHROPIC_API_KEY`,
  or use Path B and sign in first.
- **The agent's `bash` tool errors** → on Windows the `bash` tool needs Git Bash
  on your PATH (the Houston app bundles it). The `read`/`write`/`edit` tools work
  everywhere — the sample prompt only uses `write`.

---

# macOS / Linux (bash)

```bash
# setup
curl -fsSL https://bun.sh/install | bash      # reopen terminal afterwards
pnpm install
git checkout worktree-ts-engine

# Path A — real Claude turn in the terminal (needs a key)
export HOUSTON_HOME=/tmp/houston-ts-demo
bash packages/engine/scripts/scratch-home.sh
bun run packages/engine/core/scripts/verify.ts                       # VERIFY_OK
export ANTHROPIC_API_KEY=sk-ant-...
bun run packages/engine/core/scripts/real-turn.ts "Write a haiku and save it to poem.txt"

# Path B — desktop app with OAuth login
bun build --compile packages/engine/server/src/main.ts --outfile packages/engine/server/dist/houston-engine
HOUSTON_ENGINE_BIN="$PWD/packages/engine/server/dist/houston-engine" pnpm --dir app tauri dev
```
