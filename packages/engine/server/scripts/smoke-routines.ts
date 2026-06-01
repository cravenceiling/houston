/**
 * In-process smoke test for routines (chunk E). Exercises routine data CRUD +
 * runs + scheduler-lifecycle endpoints over the wire, and asserts the
 * `RoutinesChanged` / `RoutineRunsChanged` events fire (the onboarding "Routine"
 * mission done-gate). Run: `bun scripts/smoke-routines.ts`.
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineState, type HoustonEvent } from "@houston-ai/engine-core";
import { buildApp } from "../src/router.ts";

const home = mkdtempSync(join(tmpdir(), "ts-routines-"));
const token = "smoke-token";
const engine = new EngineState({ bindHost: "127.0.0.1", bindPort: 0, token, homeDir: home, docsDir: home });
const app = buildApp(engine);

const events: HoustonEvent["type"][] = [];
engine.events.subscribe((e) => events.push(e.type));

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

const ap = encodeURIComponent(home);
const fails: string[] = [];
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "OK  " : "MISS"} ${label}`);
  if (!cond) fails.push(label);
};

// Empty to start.
const empty0 = await call("GET", `/v1/agents/routines?agent_path=${ap}`);
check(empty0.status === 200 && Array.isArray(empty0.body) && empty0.body.length === 0, "list empty initially");

// Create.
const created = await call("POST", `/v1/agents/routines?agent_path=${ap}`, {
  name: "Morning check",
  prompt: "What's new?",
  schedule: "0 9 * * 1-5",
});
check(created.status === 200 && typeof created.body?.id === "string", "create -> 200 w/ id");
check(created.body?.enabled === true, "enabled defaults true");
check(created.body?.suppress_when_silent === true, "suppress defaults true");
check(created.body?.timezone === null, "timezone defaults null");
check(events.includes("RoutinesChanged"), "create emits RoutinesChanged");
const rid: string = created.body.id;

// List shows it + persisted on disk.
const list = await call("GET", `/v1/agents/routines?agent_path=${ap}`);
check(list.body?.length === 1 && list.body[0].id === rid, "list shows the routine");
check(existsSync(join(home, ".houston", "routines", "routines.json")), "routines.json on disk");

// Update.
const updated = await call("PATCH", `/v1/agents/routines/${rid}?agent_path=${ap}`, {
  enabled: false,
  schedule: "*/5 * * * *",
});
check(updated.status === 200 && updated.body?.enabled === false, "update sets enabled false");
check(updated.body?.schedule === "*/5 * * * *", "update sets schedule");

// Runs: create + list.
const run = await call("POST", `/v1/agents/routine-runs?agent_path=${ap}`, { routine_id: rid });
check(run.status === 200 && run.body?.status === "running", "create run -> running");
check(run.body?.session_key === `routine-${rid}-run-${run.body.id}`, "run session_key format");
check(events.includes("RoutineRunsChanged"), "create run emits RoutineRunsChanged");
const runs = await call("GET", `/v1/agents/routine-runs?agent_path=${ap}&routine_id=${rid}`);
check(runs.body?.length === 1, "list runs for routine");

// Update run -> surfaced.
const runUpd = await call("PATCH", `/v1/agents/routine-runs/${run.body.id}?agent_path=${ap}`, {
  status: "surfaced",
  summary: "done",
});
check(runUpd.body?.status === "surfaced" && runUpd.body?.summary === "done", "update run status+summary");

// Scheduler lifecycle no-ops succeed (boot calls these).
const start = await call("POST", `/v1/routines/scheduler/start?agentPath=${ap}`);
check(start.status === 200, "scheduler/start -> 200 (no-op)");
const sync = await call("POST", `/v1/routines/scheduler/sync?agentPath=${ap}`);
check(sync.status === 200, "scheduler/sync -> 200 (no-op)");

// run-now is an honest 503 (runner not yet wired), not a fake success.
const runNow = await call("POST", `/v1/routines/${rid}/run-now?agentPath=${ap}`);
check(runNow.status === 503, "run-now -> 503 (runner not yet)");

// Delete.
const del = await call("DELETE", `/v1/agents/routines/${rid}?agent_path=${ap}`);
check(del.status === 200, "delete -> 200");
const after = await call("GET", `/v1/agents/routines?agent_path=${ap}`);
check(after.body?.length === 0, "routine gone after delete");

console.log(fails.length === 0 ? "ROUTINES_OK" : "ROUTINES_FAIL");
process.exit(fails.length === 0 ? 0 : 1);
