/**
 * In-process smoke test for agent-create (chunk B). Boots the full Hono app
 * against a throwaway home dir and exercises the wire route, then asserts the
 * on-disk scaffold matches `agents_crud.rs::create`. Run: `bun scripts/smoke-create.ts`.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineState } from "@houston-ai/engine-core";
import { buildApp } from "../src/router.ts";

const home = mkdtempSync(join(tmpdir(), "ts-smoke-"));
mkdirSync(join(home, "db"), { recursive: true });
const token = "smoke-token";
const engine = new EngineState({
  bindHost: "127.0.0.1",
  bindPort: 0,
  token,
  homeDir: home,
  docsDir: home,
});
const app = buildApp(engine);

async function call(method: string, path: string, body?: unknown) {
  const res = await app.fetch(
    new Request(`http://x${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const ws = await call("POST", "/v1/workspaces", { name: "Smoke" });
console.log("create ws    ->", ws.status, JSON.stringify(ws.body));

const agent = await call("POST", `/v1/workspaces/${ws.body.id}/agents`, {
  name: "Assistant",
  configId: "personal-assistant",
});
console.log("create agent ->", agent.status, JSON.stringify(agent.body));

const list = await call("GET", `/v1/workspaces/${ws.body.id}/agents`);
console.log("list agents  ->", list.status, "count=", list.body?.length);

const adir = join(home, "Smoke", "Assistant");
const checks = [
  ".houston/agent.json",
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  ".agents/skills",
  ".houston/activity.json",
  ".houston/config.json",
  ".houston/prompts/modes",
];
let allPresent = true;
for (const f of checks) {
  const ok = existsSync(join(adir, f));
  if (!ok) allPresent = false;
  console.log(`  ${ok ? "OK  " : "MISS"} ${f}`);
}
console.log("CLAUDE.md content:", JSON.stringify(readFileSync(join(adir, "CLAUDE.md"), "utf-8")));

const pass = agent.status === 200 && list.body?.length === 1 && allPresent;
console.log(pass ? "SMOKE_OK" : "SMOKE_FAIL");
process.exit(pass ? 0 : 1);
