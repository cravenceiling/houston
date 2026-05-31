/**
 * Drive ONE real chat turn against a real model — no desktop app required.
 *
 * Boots the real engine (real pi model registry) and drives it through the real
 * @houston-ai/engine-client, streaming an actual Claude response. Auth comes
 * from either:
 *   - ANTHROPIC_API_KEY (a normal `sk-ant-api...` key), or
 *   - a prior OAuth login (creds in <home>/oauth/auth.json) — but that login
 *     happens in a browser, so the desktop app is the easy way to get it.
 *
 * Usage:
 *   HOUSTON_HOME=/path/to/fixture ANTHROPIC_API_KEY=sk-ant-... \
 *     bun run packages/engine/core/scripts/real-turn.ts "your prompt here"
 */

import { EngineState, configFromEnv } from "../src/index.ts";
import { buildApp } from "../../server/src/router.ts";
import { makeWebSocketHandler, upgradeWs } from "../../server/src/ws.ts";
import { HoustonClient } from "../../../../ui/engine-client/src/client.ts";
import { EngineWebSocket } from "../../../../ui/engine-client/src/ws.ts";

const config = configFromEnv();
const engine = new EngineState(config); // default resolver = real pi models

const hasKey = !!process.env.ANTHROPIC_API_KEY;
const hasOAuth = !!(await engine.auth.oauthApiKeyFor("anthropic"));
if (!hasKey && !hasOAuth) {
  console.error(
    "No Anthropic auth found.\n" +
      "  - set ANTHROPIC_API_KEY=sk-ant-..., or\n" +
      "  - log in via the desktop app (Sign in with Anthropic) first.\n",
  );
  process.exit(2);
}
console.error(`auth: ${hasKey ? "ANTHROPIC_API_KEY" : "OAuth login"}`);

const app = buildApp(engine);
const server = Bun.serve({
  hostname: config.bindHost,
  port: 0,
  fetch(req, srv) {
    if (new URL(req.url).pathname === "/v1/ws") return upgradeWs(engine, req, srv);
    return app.fetch(req);
  },
  websocket: makeWebSocketHandler(engine),
});
const client = new HoustonClient({ baseUrl: `http://127.0.0.1:${server.port}`, token: config.token });

const workspaces = await client.listWorkspaces();
if (workspaces.length === 0) {
  console.error("No workspaces in HOUSTON_HOME — run the scratch-home script first.");
  process.exit(2);
}
const agents = await client.listAgents(workspaces[0].id);
if (agents.length === 0) {
  console.error("No agents in the first workspace — run the scratch-home script first.");
  process.exit(2);
}
const agentPath = agents[0].folderPath;
const sessionKey = "real-1";
const prompt =
  process.argv[2] ??
  "In one short sentence, introduce yourself, then create a file named hello.txt with a friendly greeting.";

let done = false;
const ws = new EngineWebSocket(client);
ws.onEvent((e: any) => {
  if (e.type === "FeedItem") {
    const it = e.data.item;
    if (it.feed_type === "assistant_text_streaming") process.stdout.write(`\rassistant> ${it.data}`);
    else if (it.feed_type === "assistant_text") console.log(`\rassistant> ${it.data}`);
    else if (it.feed_type === "thinking") console.log(`\n[thinking] ${String(it.data).slice(0, 120)}…`);
    else if (it.feed_type === "tool_call") console.log(`\n[tool ${it.data.name}] ${JSON.stringify(it.data.input).slice(0, 100)}`);
    else if (it.feed_type === "tool_result") console.log(`[tool result] ${String(it.data.content).slice(0, 100)}`);
    else if (it.feed_type === "file_changes") console.log(`[files] created=${JSON.stringify(it.data.created)} modified=${JSON.stringify(it.data.modified)}`);
    else if (it.feed_type === "provider_error") console.log(`\n[provider error] ${JSON.stringify(it.data)}`);
  } else if (e.type === "SessionStatus") {
    console.log(`\n[status] ${e.data.status}${e.data.error ? ` — ${e.data.error}` : ""}`);
    if (e.data.status === "completed" || e.data.status === "error") done = true;
  }
});
ws.subscribe([`session:${sessionKey}`, `agent:${agentPath}`]);
ws.connect();
await new Promise((r) => setTimeout(r, 200));

console.log(`\nuser> ${prompt}\n`);
await client.startSession(agentPath, { sessionKey, prompt, provider: "anthropic", model: "sonnet" });

const deadline = Date.now() + 120_000;
while (!done && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
await new Promise((r) => setTimeout(r, 300));
ws.disconnect();
server.stop(true);
engine.db.close();
process.exit(0);
