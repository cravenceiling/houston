# Houston Engine — TypeScript

A **wire-compatible TypeScript reimplementation** of the Rust Houston Engine
(`engine/`), running the agent loop **in-process** via
[`@earendil-works/pi-agent-core`](https://github.com/earendil-works/pi/tree/main/packages/agent)
+ [`@earendil-works/pi-ai`](https://github.com/earendil-works/pi/tree/main/packages/ai)
instead of shelling out to provider CLIs.

It speaks the **same `/v1` HTTP + WebSocket protocol**, reads/writes the **same
`~/.houston` data**, and is spawned the **same way** as the Rust sidecar — so the
desktop app, mobile PWA, and `examples/smartbooks` consume it unchanged. There
is **no proxy**: wire-compatibility *is* the bridge.

> Status: foundation + a proven end-to-end live chat turn. This is an in-progress
> parity effort — see the roadmap. The Rust engine in `engine/` is untouched and
> remains the production engine.

## Packages

| Package | Dir | What |
|---|---|---|
| `@houston-ai/engine-protocol` | `protocol/` | Wire DTOs, the WS envelope, the `HoustonEvent` + `FeedItem` unions, zod request schemas. Hand-mirrored from `houston-engine-protocol` + `houston-ui-events` + `houston-terminal-manager`. |
| `@houston-ai/engine-core` | `core/` | Frontend-agnostic domain runtime: config/paths, the event bus, workspaces/agents/`.houston` file I/O, the SQLite chat feed, and the pi-driven session runtime. |
| `@houston-ai/engine-server` | `server/` | Hono + Bun.serve HTTP/WS server. The runnable binary and the drop-in sidecar. |

## Architecture

```
desktop app / mobile / smartbooks  ──HTTP+WS /v1──►  engine-server (Bun + Hono)
                                                        │  bearer auth (3 token locations)
                                                        │  /v1/ws firehose (topics, backpressure, 20s ping)
                                                        ▼
                                                     engine-core
                                                        │  workspaces / agents / .houston files
                                                        │  chat_feed (bun:sqlite, same houston.db schema)
                                                        ▼
                                                     session runtime
                                                        │  prompt assembly from disk (product + agent context)
                                                        │  pi Agent.prompt()  ──►  pi-ai streamSimple ──► model API
                                                        │  AgentEvent ─► FeedItem  (REPLACE streaming reducer)
                                                        │  read/write/edit/bash tools
                                                        ▼
                                                  WS session:<key>  +  chat_feed persistence
```

The session runtime keeps every Houston-specific concern bespoke (per-`sessionKey`
turn queue + cancel staleness, system-prompt assembly from disk, file-change
snapshot/diff attribution, the board activity state machine, session-id
persistence, chat-feed persistence) and lets pi own the model loop, tool calling,
and streaming.

## Run it (dev)

```bash
# from the repo root
pnpm install
HOUSTON_HOME=~/.houston HOUSTON_ENGINE_TOKEN=dev \
  bun run packages/engine/server/src/main.ts
# -> prints: HOUSTON_ENGINE_LISTENING port=<p> token=dev   (stdout, banner only)
#    logs go to stderr
```

Environment (the spawn contract, identical to the Rust engine): `HOUSTON_HOME`,
`HOUSTON_DOCS`, `HOUSTON_BIND` / `HOUSTON_BIND_ALL`, `HOUSTON_ENGINE_TOKEN`,
`HOUSTON_APP_SYSTEM_PROMPT`, `HOUSTON_APP_ONBOARDING_PROMPT`, `HOUSTON_TUNNEL_URL`,
`HOUSTON_NO_PARENT_WATCHDOG`.

## Use it as the desktop app's engine (drop-in sidecar)

The Tauri supervisor's `resolve_engine_binary` checks `HOUSTON_ENGINE_BIN` **first**,
so no app changes are needed:

```bash
# dev: point the desktop app at the TS engine
HOUSTON_ENGINE_BIN="bun run /abs/path/packages/engine/server/src/main.ts" pnpm --dir app tauri dev

# release-style: compile a single self-contained binary, then point at it
bun build --compile packages/engine/server/src/main.ts --outfile dist/houston-engine
HOUSTON_ENGINE_BIN="$PWD/dist/houston-engine" pnpm --dir app tauri dev
```

The binary emits the `HOUSTON_ENGINE_LISTENING port=<p> token=<t>` banner, writes
`<home>/engine.json` (`{version, protocol, port, pid, token_hash}`), and
self-terminates on stdin EOF — exactly what the supervisor expects.

## Provider login (OAuth)

`POST /v1/providers/:name/login` (`anthropic` or `openai`) runs pi-ai's
browser-approve OAuth loopback — the same "open the link, approve in your
browser" flow as Claude Code / Codex:

1. the engine starts pi-ai's localhost callback server and emits the sign-in URL
   as a `ProviderLoginUrl` WS event (topic `providers`);
2. the user opens it and approves; the provider redirects to the local callback;
3. the engine persists the OAuth credentials to `<home>/oauth/auth.json` (0600)
   and emits `ProviderLoginComplete`. `GET /v1/providers/:name/status` then
   reports `authenticated`.

`POST .../login/code` (paste-back for remote engines), `POST .../login/cancel`,
and `POST .../logout` round out the surface. In the desktop app this drives the
"Sign in with Anthropic / ChatGPT" button. Using that token in an actual model
turn (oauth Bearer + beta headers, Codex base URL) is the remaining M4 step.

## Test / prove

`core/scripts/proof.ts` boots the real server with a **faux** model injected at the
`modelResolver` boundary (no API keys) and drives it through the real
`@houston-ai/engine-client`, asserting the full FeedItem stream, tool execution,
file-change attribution, and chat-feed persistence:

```bash
HOUSTON_HOME=/tmp/fix HOUSTON_ENGINE_TOKEN=t bun run packages/engine/core/scripts/proof.ts
```

## Parity status

| Milestone | Status |
|---|---|
| M1 — server + auth + WS firehose + banner + watchdog + engine.json | ✅ |
| M2 — read domain (workspaces, agents, `.houston` files, project files, config, activities) | ✅ |
| M3 — live chat turn via pi (streaming, tools, file-change attribution, chat_feed, board flips, history, cancel) | ✅ |
| M4 — providers/auth | 🟡 OAuth login (Claude + Codex, browser-approve) done; remaining: use the OAuth token in model requests (Anthropic oauth Bearer + beta header, Codex responses base URL), the Houston model-alias table, and the full `ProviderError` taxonomy |
| M5 — routines + scheduler (cron, run-now/cancel, heartbeat) | ⬜ |
| M6 — store, skills (+ community), portable agent share/import | ⬜ |
| M7 — attachments (two-phase upload), worktrees, `/shell`, file watcher | ⬜ |
| M8 — mobile tunnel + device tokens, composio | ⬜ |
| M9 — bundled single-binary sidecar in CI + cross-platform compile | 🟡 (`bun --compile` proven locally) |

The agent-CRUD `create` route and the typed agent-data write routes
(activities/routines mutate) land with M3 follow-ups + M5; today the read surface
and the live turn are complete.

## Key decisions

- **In-process loop, not CLI passthrough.** Agents run via pi against model APIs
  directly. Provider *login* therefore moves to pi-ai `./oauth` (M4).
- **Bun runtime.** Native WS server, `bun:sqlite` (reads the same `houston.db`),
  single-binary compile (matching pi's own `coding-agent`).
- **Hand-mirrored wire types + zod**, guarding against drift until Rust→TS
  codegen lands. The Rust side stays the source of truth.
