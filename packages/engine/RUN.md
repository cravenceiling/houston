# Running the TypeScript engine — step by step

This is the no-assumptions guide. Run every command from the **repo root**
(the folder that contains `app/`, `engine/`, `packages/`).

## 0. One-time setup

Install Bun (the runtime the engine uses):

```bash
curl -fsSL https://bun.sh/install | bash
```

Then **close and reopen your terminal** (so `bun` is on your PATH), and install
dependencies:

```bash
pnpm install
```

Make sure you're on the engine branch:

```bash
git checkout worktree-ts-engine
```

---

## Path A — see a real Claude reply in your terminal (no desktop app)

This is the fastest way to confirm a real model turn works. You need an
Anthropic **API key** (`sk-ant-...` from console.anthropic.com).

```bash
# 1. make a throwaway home with one agent (doesn't touch your real ~/.houston)
export HOUSTON_HOME=/tmp/houston-ts-demo
bash packages/engine/scripts/scratch-home.sh

# 2. sanity check (no key needed — uses a fake model)
bun run packages/engine/core/scripts/verify.ts          # prints VERIFY_OK

# 3. a REAL Claude turn (uses your key)
export ANTHROPIC_API_KEY=sk-ant-...your-key...
bun run packages/engine/core/scripts/real-turn.ts "Write a haiku about engines and save it to poem.txt"
```

You'll watch Claude stream its reply and create `poem.txt` inside the scratch
agent folder (`/tmp/houston-ts-demo/workspaces/Personal/Buddy/`).

---

## Path B — the real desktop app, signing in with your subscription (OAuth)

This uses the **"Sign in with Anthropic"** browser flow (no API key), with your
real `~/.houston` workspaces.

```bash
# 1. build the engine into a single binary
bun build --compile packages/engine/server/src/main.ts \
  --outfile packages/engine/server/dist/houston-engine

# 2. launch the desktop app pointed at it
HOUSTON_ENGINE_BIN="$PWD/packages/engine/server/dist/houston-engine" \
  pnpm --dir app tauri dev
```

In the app:

1. It boots against the TS engine (you'll land in your normal workspace if you
   already have one).
2. Open provider settings and click **Sign in with Anthropic** (or ChatGPT for
   Codex) → a browser tab opens → approve → you're back in the app, signed in.
3. Start a mission and chat. Claude streams a real reply and can read/write
   files in the agent folder.

> Rebuilt the engine? Re-run step 1 and restart the app — the binary is a
> snapshot, not live-reloaded.

---

## What works vs. what doesn't (yet)

**Works:** boot/handshake, workspaces + agents, file browser with live updates,
board missions (create / chat / status), **real Claude chat** (Path A via API
key, Path B via OAuth login), provider OAuth login for Claude + Codex.

**Not yet (these tabs/actions will be empty or error in the app):** routines,
store, skills, Composio integrations, conversations list, worktrees,
attachments, and **chatting through a Codex (ChatGPT) subscription** — Codex
*login* works, but using that token for a turn needs the codex-responses path
(a follow-up). See the roadmap in `packages/engine/README.md`.

---

## Troubleshooting

- **`bun: command not found`** — reopen your terminal after installing Bun, or
  run `source ~/.zshrc` (or `~/.bashrc`).
- **"No Anthropic auth found"** from `real-turn.ts` — set `ANTHROPIC_API_KEY`,
  or use Path B and sign in first.
- **App shows a provider error when chatting** — you're not signed in (Path B)
  or the key is missing/invalid (Path A).
- **Want to watch the engine's logs** — they go to stderr; in Path A you see
  them inline. The app captures them to its `engine.log`.
