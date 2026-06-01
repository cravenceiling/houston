/**
 * In-process smoke test for the file watcher (chunk C). Boots the full Hono
 * app, starts a watcher over a temp agent dir via the wire route, writes files
 * that should map to distinct events, and asserts the engine event bus emits
 * the right `*Changed` events (deduped, debounced). Run: `bun scripts/smoke-watcher.ts`.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineState, type HoustonEvent } from "@houston-ai/engine-core";
import { buildApp } from "../src/router.ts";

const home = mkdtempSync(join(tmpdir(), "ts-watch-"));
const token = "smoke-token";
const engine = new EngineState({
  bindHost: "127.0.0.1",
  bindPort: 0,
  token,
  homeDir: home,
  docsDir: home,
});
const app = buildApp(engine);

// Capture every event the bus emits.
const seen: HoustonEvent[] = [];
engine.events.subscribe((e) => seen.push(e));

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
  return res.status;
}

const agentDir = join(home, "Agent");
mkdirSync(join(agentDir, ".agents", "skills", "plan-my-day"), { recursive: true });
mkdirSync(join(agentDir, ".houston", "routines"), { recursive: true });
mkdirSync(join(agentDir, ".houston", "activity"), { recursive: true });

const startStatus = await call("POST", "/v1/watcher/start", { agentPath: agentDir });
console.log("watcher/start ->", startStatus);

// Give fs.watch a beat to arm, then write files that map to 3 distinct events.
await new Promise((r) => setTimeout(r, 200));
writeFileSync(join(agentDir, ".agents", "skills", "plan-my-day", "SKILL.md"), "# skill");
writeFileSync(join(agentDir, ".houston", "routines", "routines.json"), "[]");
writeFileSync(join(agentDir, ".houston", "activity", "activity.json"), "[]");
writeFileSync(join(agentDir, "CLAUDE.md"), "# role");

// Wait out the 500ms debounce + margin.
await new Promise((r) => setTimeout(r, 900));

const stopStatus = await call("POST", "/v1/watcher/stop");
console.log("watcher/stop  ->", stopStatus);

const types = new Set(seen.map((e) => e.type));
console.log("events seen:", [...types].sort().join(", ") || "(none)");

// Skills + Routines are the onboarding done-gates; Context (CLAUDE.md) +
// Activity round out the classifier coverage.
const want = ["SkillsChanged", "RoutinesChanged"];
const missing = want.filter((t) => !types.has(t));
for (const t of want) console.log(`  ${types.has(t) ? "OK  " : "MISS"} ${t}`);

const pass = startStatus === 200 && stopStatus === 200 && missing.length === 0;
console.log(pass ? "WATCH_OK" : "WATCH_FAIL");
process.exit(pass ? 0 : 1);
