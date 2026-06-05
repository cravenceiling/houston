/**
 * In-process smoke test for `/v1/conversations/{list,list-all}`. Ports the Rust
 * unit tests from `conversations.rs`: derives a conversation view over
 * `.houston/activity/activity.json`, sorted most-recent-first, surfacing the
 * stored `session_key` verbatim (routine chats keep `routine-{rid}`; legacy /
 * blank keys fall back to `activity-{id}`), and aggregates across agents.
 * Run: `bun scripts/smoke-conversations.ts`.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineState } from "@houston-ai/engine-core";
import { buildApp } from "../src/router.ts";

const home = mkdtempSync(join(tmpdir(), "ts-conversations-"));
const token = "smoke-token";
const engine = new EngineState({
  bindHost: "127.0.0.1",
  bindPort: 0,
  token,
  homeDir: home,
  docsDir: home,
});
const app = buildApp(engine);

async function post(path: string, body: unknown) {
  const res = await app.fetch(
    new Request(`http://x${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Seed an agent dir with an activity.json array; returns its absolute path. */
function seedAgent(name: string, activities: unknown[]): string {
  const dir = join(home, name);
  mkdirSync(join(dir, ".houston", "activity"), { recursive: true });
  writeFileSync(
    join(dir, ".houston", "activity", "activity.json"),
    JSON.stringify(activities, null, 2),
  );
  return dir;
}

const fails: string[] = [];
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "OK  " : "MISS"} ${label}`);
  if (!cond) fails.push(label);
};

// 1. Missing activity.json -> [].
const emptyAgent = join(home, "EmptyAgent");
mkdirSync(emptyAgent, { recursive: true });
const empty = await post("/v1/conversations/list", { agentPath: emptyAgent });
check(empty.status === 200 && Array.isArray(empty.body) && empty.body.length === 0, "missing -> []");

// 2. Sorted desc + session_key/description handling.
const sortedDir = seedAgent("Sorted", [
  { id: "a", title: "Old", description: "", status: "done", updated_at: "2025-01-01T00:00:00Z" },
  { id: "b", title: "Newer", description: "d", status: "running", updated_at: "2026-02-02T00:00:00Z" },
]);
const sorted = await post("/v1/conversations/list", { agentPath: sortedDir });
check(sorted.body?.length === 2 && sorted.body[0].id === "b", "sorted most-recent-first");
check(sorted.body?.[0]?.session_key === "activity-b", "session_key fallback activity-b");
check(sorted.body?.[0]?.type === "activity", "type is activity");
check(sorted.body?.[0]?.description === "d", "non-empty description present");
check(!("description" in sorted.body[1]), "empty description omitted");
check(sorted.body?.[0]?.agent_name === "Sorted", "agent_name = folder basename");
check(sorted.body?.[0]?.agent_path === sortedDir, "agent_path = resolved dir");

// 3. Routine chat keeps its stable per-routine key.
const routineDir = seedAgent("Routine", [
  {
    id: "act-uuid",
    title: "Morning digest",
    description: "",
    status: "needs_you",
    session_key: "routine-abc",
    routine_id: "abc",
    updated_at: "2026-02-02T00:00:00Z",
  },
]);
const routine = await post("/v1/conversations/list", { agentPath: routineDir });
check(routine.body?.[0]?.session_key === "routine-abc", "routine keeps routine-abc key");
check(routine.body?.[0]?.routine_id === "abc", "routine_id surfaced");

// 4. Metadata preserved; 5. blank/missing session_key -> activity-{id}.
const metaDir = seedAgent("Meta", [
  {
    id: "act",
    title: "Work",
    description: "",
    status: "running",
    session_key: "",
    agent: "research",
    worktree_path: "/tmp/worktree",
    updated_at: "2026-02-02T00:00:00Z",
  },
]);
const meta = await post("/v1/conversations/list", { agentPath: metaDir });
check(meta.body?.[0]?.agent === "research", "agent metadata preserved");
check(meta.body?.[0]?.worktree_path === "/tmp/worktree", "worktree_path preserved");
check(meta.body?.[0]?.session_key === "activity-act", "blank session_key -> activity-{id}");

// 6. list-all aggregates across agents, newest first; bad agent skipped.
const d1 = seedAgent("Ag1", [
  { id: "x", title: "X", description: "", status: "done", updated_at: "2026-01-01T00:00:00Z" },
]);
const d2 = seedAgent("Ag2", [
  { id: "y", title: "Y", description: "", status: "done", updated_at: "2026-03-01T00:00:00Z" },
]);
const all = await post("/v1/conversations/list-all", {
  agentPaths: [d1, d2, join(home, "DoesNotExist")],
});
check(all.body?.length === 2 && all.body[0].id === "y", "list-all aggregates newest-first");

console.log(fails.length === 0 ? "CONVERSATIONS_OK" : "CONVERSATIONS_FAIL");
process.exit(fails.length === 0 ? 0 : 1);
