/**
 * In-process smoke test for skills CRUD (chunk D). Exercises the wire routes
 * end to end and asserts SKILL.md round-trips (create → list → load → save
 * bumps version → delete) and that mutations emit `SkillsChanged`.
 * Run: `bun scripts/smoke-skills.ts`.
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineState, type HoustonEvent } from "@houston-ai/engine-core";
import { buildApp } from "../src/router.ts";

const home = mkdtempSync(join(tmpdir(), "ts-skills-"));
const token = "smoke-token";
const engine = new EngineState({
  bindHost: "127.0.0.1",
  bindPort: 0,
  token,
  homeDir: home,
  docsDir: home,
});
const app = buildApp(engine);

const skillsChanged: HoustonEvent[] = [];
engine.events.subscribe((e) => {
  if (e.type === "SkillsChanged") skillsChanged.push(e);
});

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

const ws = encodeURIComponent(home);
const fails: string[] = [];
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "OK  " : "MISS"} ${label}`);
  if (!cond) fails.push(label);
};

// Empty list to start.
const empty = await call("GET", `/v1/skills?workspacePath=${ws}`);
check(empty.status === 200 && Array.isArray(empty.body) && empty.body.length === 0, "list empty initially");

// Create.
const created = await call("POST", "/v1/skills", {
  workspacePath: home,
  name: "plan-my-working-day",
  description: "Plan the day",
  content: "## Procedure\n\n1. Triage inbox\n2. Block focus time\n",
});
check(created.status === 200, "create -> 200");
check(skillsChanged.length === 1, "create emits SkillsChanged");

// List shows it.
const list = await call("GET", `/v1/skills?workspacePath=${ws}`);
check(list.status === 200 && list.body.length === 1, "list shows 1 skill");
check(list.body?.[0]?.name === "plan-my-working-day", "skill name correct");
check(list.body?.[0]?.version === 1, "skill version 1");

// On-disk layout.
check(existsSync(join(home, ".agents", "skills", "plan-my-working-day", "SKILL.md")), "SKILL.md on disk");

// Load returns body.
const loaded = await call("GET", `/v1/skills/plan-my-working-day?workspacePath=${ws}`);
check(loaded.status === 200 && loaded.body?.content?.includes("Triage inbox"), "load returns body");

// Save bumps version + emits.
const saved = await call("PUT", "/v1/skills/plan-my-working-day", {
  workspacePath: home,
  content: "## Procedure\n\nv2 body\n",
});
check(saved.status === 200, "save -> 200");
const reloaded = await call("GET", `/v1/skills/plan-my-working-day?workspacePath=${ws}`);
check(reloaded.body?.version === 2, "save bumped version to 2");
check(reloaded.body?.content?.includes("v2 body"), "save updated body");

// Delete removes dir + emits.
const removed = await call("DELETE", `/v1/skills/plan-my-working-day?workspacePath=${ws}`);
check(removed.status === 200, "delete -> 200");
check(!existsSync(join(home, ".agents", "skills", "plan-my-working-day")), "skill dir gone");

// Community endpoint is an honest 503, not a confusing 404.
const community = await call("POST", "/v1/skills/community/search", { query: "x" });
check(community.status === 503, "community/search -> 503 (not yet)");

console.log("SkillsChanged total:", skillsChanged.length, "(expect 3: create+save+delete)");
check(skillsChanged.length === 3, "3 SkillsChanged events");

console.log(fails.length === 0 ? "SKILLS_OK" : "SKILLS_FAIL");
process.exit(fails.length === 0 ? 0 : 1);
