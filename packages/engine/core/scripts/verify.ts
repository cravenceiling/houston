/**
 * Verifies the "logged-in account can chat" slice (no API keys needed):
 *  - model-alias resolution (sonnet/opus -> concrete pi ids; full ids pass through)
 *  - activity (board mission) CRUD over HTTP
 *  - the full board flow: create activity -> start session on its session_key ->
 *    faux turn -> activity flips running -> needs_you, history persisted
 *  - OAuth-token wiring (oauthApiKeyFor returns the Anthropic token, not OpenAI's)
 */

import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
  registerFauxProvider,
} from "@earendil-works/pi-ai";
import { EngineState, configFromEnv, defaultModelResolver } from "../src/index.ts";
import { buildApp } from "../../server/src/router.ts";
import { makeWebSocketHandler, upgradeWs } from "../../server/src/ws.ts";
import { HoustonClient } from "../../../../ui/engine-client/src/client.ts";
import { EngineWebSocket } from "../../../../ui/engine-client/src/ws.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(25);
  }
  return pred();
}

const checks: [string, boolean][] = [];

// --- 1. model alias resolution (registry lookup, no network) ---
checks.push(["alias sonnet -> claude-sonnet-4-5", defaultModelResolver("anthropic", "sonnet").model.id === "claude-sonnet-4-5"]);
checks.push(["alias opus -> claude-opus-4-8", defaultModelResolver("anthropic", "opus").model.id === "claude-opus-4-8"]);
checks.push(["full id passes through", defaultModelResolver("anthropic", "claude-opus-4-7").model.id === "claude-opus-4-7"]);

// --- 2/3. board mission flow with a faux model ---
const config = configFromEnv();
const faux = registerFauxProvider({ provider: "anthropic", models: [{ id: "sonnet", name: "Sonnet" }] });
faux.setResponses([
  fauxAssistantMessage(
    [fauxThinking("Writing the report."), fauxToolCall("write", { path: "report.md", content: "# Q4\nUp 20%.\n" })],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage([fauxText("Done — report.md created.")]),
]);
const engine = new EngineState(config, {
  modelResolver: (_p, alias) => ({ model: faux.getModel(alias ?? "sonnet") ?? faux.getModel() }),
});
const server = Bun.serve({
  hostname: config.bindHost,
  port: 0,
  fetch(req, srv) {
    if (new URL(req.url).pathname === "/v1/ws") return upgradeWs(engine, req, srv);
    return app.fetch(req);
  },
  websocket: makeWebSocketHandler(engine),
});
const app = buildApp(engine);
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

// activity CRUD
const activity = await client.createActivity(agentPath, { title: "Q4 report" });
checks.push(["createActivity -> running + session_key activity-{id}", activity.status === "running" && activity.session_key === `activity-${activity.id}`]);
const listed = await client.listActivities(agentPath);
checks.push(["listActivities includes new mission", listed.some((a) => a.id === activity.id)]);
const patched = await client.updateActivity(agentPath, activity.id, { title: "Q4 report (final)" });
checks.push(["updateActivity persists title", patched.title === "Q4 report (final)"]);

// run the mission on its session_key
const feed: any[] = [];
const ws = new EngineWebSocket(client);
ws.onEvent((e) => feed.push(e));
ws.subscribe([`session:${activity.session_key}`, `agent:${agentPath}`]);
ws.connect();
await sleep(150);
await client.startSession(agentPath, { sessionKey: activity.session_key!, prompt: "Write a Q4 report." });
await waitFor(() => feed.some((e) => e.type === "SessionStatus" && e.data.status === "completed"), 5000);

const types = feed.filter((e) => e.type === "FeedItem").map((e) => e.data.item.feed_type);
checks.push(["turn produced tool_call + file_changes", types.includes("tool_call") && types.includes("file_changes")]);
const afterRun = await client.listActivities(agentPath);
const flipped = afterRun.find((a) => a.id === activity.id);
checks.push(["mission flipped running -> needs_you", flipped?.status === "needs_you"]);
const history = await client.loadChatHistory(agentPath, activity.session_key!);
checks.push(["history persisted for the mission", history.some((h) => h.feed_type === "assistant_text")]);

// deleteActivity
await client.deleteActivity(agentPath, activity.id);
checks.push(["deleteActivity removes mission", !(await client.listActivities(agentPath)).some((a) => a.id === activity.id)]);

ws.disconnect();
server.stop(true);

// --- 4. OAuth-token wiring ---
mkdirSync(join(config.homeDir, "oauth"), { recursive: true });
writeFileSync(
  join(config.homeDir, "oauth", "auth.json"),
  JSON.stringify({ anthropic: { access: "sk-ant-oat-test", refresh: "r", expires: Date.now() + 3.6e6 } }),
);
const engine2 = new EngineState(config);
checks.push(["oauthApiKeyFor(anthropic) returns the token", (await engine2.auth.oauthApiKeyFor("anthropic")) === "sk-ant-oat-test"]);
checks.push(["oauthApiKeyFor(openai) is undefined (Codex chat is a follow-up)", (await engine2.auth.oauthApiKeyFor("openai")) === undefined]);
engine2.db.close();
engine.db.close();

let pass = true;
console.log("=== slice verification ===");
for (const [n, ok] of checks) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}`);
  if (!ok) pass = false;
}
console.log(`\n${pass ? "VERIFY_OK" : "VERIFY_FAILED"}`);
process.exit(pass ? 0 : 1);
