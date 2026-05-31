/**
 * End-to-end proof of the live chat turn.
 *
 * Boots the REAL server (buildApp + Bun.serve + the WS handler) with a faux
 * model injected at the `modelResolver` boundary, then drives it through the
 * REAL `@houston-ai/engine-client` (the same library the desktop app uses):
 * subscribe -> startSession -> collect the FeedItem stream -> assert the tool
 * call executed (report.md created), file-change attribution fired, and history
 * persisted. No API keys required.
 */

import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
  registerFauxProvider,
} from "@earendil-works/pi-ai";
import { EngineState, configFromEnv } from "../src/index.ts";
import { buildApp } from "../../server/src/router.ts";
import { makeWebSocketHandler, upgradeWs } from "../../server/src/ws.ts";
import { HoustonClient } from "../../../../ui/engine-client/src/client.ts";
import { EngineWebSocket } from "../../../../ui/engine-client/src/ws.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await sleep(25);
  }
  return pred();
}

async function main() {
  const config = configFromEnv();

  // Faux Anthropic "sonnet": a 2-step turn — tool call (write report.md), then text.
  const faux = registerFauxProvider({ provider: "anthropic", models: [{ id: "sonnet", name: "Sonnet" }] });
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxThinking("The user wants a Q4 report. I'll write it to report.md."),
        fauxToolCall("write", { path: "report.md", content: "# Q4 Report\n\nRevenue up 20%.\n" }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText("Done — I created report.md with the Q4 summary.")]),
  ]);

  const engine = new EngineState(config, {
    modelResolver: (_provider, alias) => ({ model: faux.getModel(alias ?? "sonnet") ?? faux.getModel() }),
  });
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

  const baseUrl = `http://127.0.0.1:${server.port}`;
  const client = new HoustonClient({ baseUrl, token: config.token });

  const agents = await client.listAgents("ws-1");
  const agentPath = agents[0].folderPath;
  const sessionKey = "chat-1";

  const feed: any[] = [];
  const ws = new EngineWebSocket(client);
  ws.onEvent((ev) => feed.push(ev));
  ws.subscribe([`session:${sessionKey}`, `agent:${agentPath}`]);
  ws.connect();
  await sleep(200); // let the socket open + subscribe before we fire the turn

  await client.startSession(agentPath, { sessionKey, prompt: "Write a Q4 report." });

  const completed = await waitFor(
    () => feed.some((e) => e.type === "SessionStatus" && e.data.status === "completed"),
    5000,
  );

  // ---- report ----
  const feedItems = feed.filter((e) => e.type === "FeedItem").map((e) => e.data.item);
  const types = feedItems.map((i: any) => i.feed_type);
  const statuses = feed.filter((e) => e.type === "SessionStatus").map((e) => e.data.status);
  console.log("\n=== WS event stream ===");
  for (const e of feed) {
    if (e.type === "FeedItem") {
      const d = JSON.stringify(e.data.item.data).slice(0, 70);
      console.log(`  FeedItem ${e.data.item.feed_type}: ${d}`);
    } else {
      console.log(`  ${e.type}: ${JSON.stringify(e.data).slice(0, 70)}`);
    }
  }

  const history = await client.loadChatHistory(agentPath, sessionKey);
  console.log("\n=== persisted history (chat_feed) ===");
  for (const h of history) console.log(`  ${h.feed_type}: ${JSON.stringify(h.data).slice(0, 70)}`);

  // ---- assertions ----
  const reportPath = join(agentPath, "report.md");
  const fileChanges = feedItems.find((i: any) => i.feed_type === "file_changes");
  const checks: [string, boolean][] = [
    ["session completed", completed],
    ["status starting+running+completed", ["starting", "running", "completed"].every((s) => statuses.includes(s))],
    ["thinking streamed", types.includes("thinking_streaming")],
    ["thinking finalized", types.includes("thinking")],
    ["tool_call write", feedItems.some((i: any) => i.feed_type === "tool_call" && i.data.name === "write")],
    ["tool_result", types.includes("tool_result")],
    ["assistant_text streamed (REPLACE)", types.includes("assistant_text_streaming")],
    ["assistant_text finalized", types.includes("assistant_text")],
    ["final_result", types.includes("final_result")],
    ["report.md created on disk", existsSync(reportPath)],
    ["file_changes reports report.md", !!fileChanges && fileChanges.data.created.includes("report.md")],
    ["user_message echoed", types.includes("user_message")],
    ["history persisted (no streaming rows)", history.length > 0 && !history.some((h) => h.feed_type.endsWith("_streaming"))],
    ["history has assistant_text + tool_call + file_changes", ["assistant_text", "tool_call", "file_changes"].every((t) => history.some((h) => h.feed_type === t))],
  ];

  console.log("\n=== assertions ===");
  let pass = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) pass = false;
  }
  console.log(`\n${pass ? "PROOF_OK" : "PROOF_FAILED"}`);

  ws.disconnect();
  server.stop(true);
  engine.db.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("proof crashed:", e);
  process.exit(1);
});
