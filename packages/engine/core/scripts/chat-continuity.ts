/**
 * End-to-end proof of the two chat-turn fixes: (1) the user message is NOT
 * duplicated, and (2) the agent keeps conversation memory across turns.
 *
 * Boots the real server + WS with a faux model (a response FACTORY that records
 * the exact `context.messages` it was handed each call) and drives two turns on
 * ONE session key through the real `@houston-ai/engine-client`:
 *   - dedup/deferral: each turn emits exactly ONE `user_message`, and it is
 *     emitted only AFTER the model was invoked (the fix — it used to fire at turn
 *     entry, racing ahead of the frontend's optimistic push and duplicating).
 *   - memory: turn 2's model input contains turn 1's prompt + reply, and the
 *     per-slot transcript file accumulates. No API keys required.
 */

import { fauxAssistantMessage, fauxText, registerFauxProvider } from "@earendil-works/pi-ai";
import { EngineState, configFromEnv } from "../src/index.ts";
import { buildApp } from "../../server/src/router.ts";
import { makeWebSocketHandler, upgradeWs } from "../../server/src/ws.ts";
import { HoustonClient } from "../../../../ui/engine-client/src/client.ts";
import { EngineWebSocket } from "../../../../ui/engine-client/src/ws.ts";
import { existsSync, readFileSync } from "node:fs";
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

  // Records the conversation each turn's model call received, and marks that the
  // model was invoked (used to prove the user_message echo is deferred past the
  // network round-trip).
  const seen: unknown[][] = [];
  let modelInvoked = false;
  const faux = registerFauxProvider({ provider: "anthropic", models: [{ id: "sonnet", name: "Sonnet" }] });
  faux.setResponses([
    (context) => {
      modelInvoked = true;
      seen.push(context.messages);
      return fauxAssistantMessage([fauxText("Got it — teal it is.")]);
    },
    (context) => {
      modelInvoked = true;
      seen.push(context.messages);
      return fauxAssistantMessage([fauxText("Your favorite color is teal.")]);
    },
  ]);

  const engine = new EngineState(config, {
    modelResolver: (_p, alias) => ({ model: faux.getModel(alias ?? "sonnet") ?? faux.getModel() }),
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
  const sessionKey = "chat-mem-1";

  const feed: any[] = [];
  // The moment each turn's user_message echo arrives, snapshot whether the model
  // had already been invoked — the engine-level signature of the deferral fix.
  let userMsgSawModel: boolean | null = null;
  const ws = new EngineWebSocket(client);
  ws.onEvent((ev) => {
    if (ev.type === "FeedItem" && ev.data.item.feed_type === "user_message" && userMsgSawModel === null) {
      userMsgSawModel = modelInvoked;
    }
    feed.push(ev);
  });
  ws.subscribe([`session:${sessionKey}`, `agent:${agentPath}`]);
  ws.connect();
  await sleep(200);

  const fails: string[] = [];
  const check = (cond: boolean, label: string) => {
    console.log(`  ${cond ? "OK  " : "MISS"} ${label}`);
    if (!cond) fails.push(label);
  };

  async function turn(prompt: string): Promise<any[]> {
    const startIdx = feed.length;
    modelInvoked = false;
    userMsgSawModel = null;
    await client.startSession(agentPath, { sessionKey, prompt });
    await waitFor(
      () =>
        feed
          .slice(startIdx)
          .some((e) => e.type === "SessionStatus" && e.data.status === "completed"),
      5000,
    );
    return feed.slice(startIdx).filter((e) => e.type === "FeedItem").map((e) => e.data.item);
  }

  // ---- turn 1 ----
  const t1 = await turn("Remember this: my favorite color is teal.");
  const t1UserMsgs = t1.filter((i: any) => i.feed_type === "user_message");
  check(t1UserMsgs.length === 1, "turn 1 emits exactly one user_message (no duplicate)");
  check(t1UserMsgs[0]?.data === "Remember this: my favorite color is teal.", "turn 1 user_message text correct");
  check(userMsgSawModel === true, "turn 1 user_message deferred until AFTER the model was invoked");
  const transcriptFile = join(agentPath, ".houston", "sessions", "anthropic", `${sessionKey}.messages.json`);
  check(existsSync(transcriptFile), "transcript saved after turn 1");

  // ---- turn 2 (same session key) ----
  const t2 = await turn("What is my favorite color?");
  const t2UserMsgs = t2.filter((i: any) => i.feed_type === "user_message");
  check(t2UserMsgs.length === 1, "turn 2 emits exactly one user_message (no duplicate)");
  check(userMsgSawModel === true, "turn 2 user_message deferred until AFTER the model was invoked");

  // ---- memory ----
  check(seen.length === 2, "model invoked once per turn");
  check(Array.isArray(seen[0]) && seen[0].length === 1, "turn 1 model saw only the new prompt (fresh context)");
  const t2ctx = JSON.stringify(seen[1] ?? []);
  check((seen[1]?.length ?? 0) >= 3, "turn 2 model saw prior turn (user + assistant + new prompt)");
  check(t2ctx.includes("favorite color is teal"), "turn 2 model context carries turn 1's user prompt");
  check(t2ctx.includes("teal it is"), "turn 2 model context carries turn 1's assistant reply");
  const saved = JSON.parse(readFileSync(transcriptFile, "utf-8"));
  check(Array.isArray(saved) && saved.length >= 4, "transcript accumulated both turns (>=4 messages)");

  console.log(`\n${fails.length === 0 ? "CONTINUITY_OK" : "CONTINUITY_FAILED"}`);
  ws.disconnect();
  server.stop(true);
  engine.db.close();
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("continuity crashed:", e);
  process.exit(1);
});
