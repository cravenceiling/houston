/**
 * Smoke test for the summarize route (chunk G part 2). The contract that
 * matters: title generation NEVER blocks conversation creation — any model
 * failure degrades to a deterministic local `{ title, description }`. We force
 * that path with a model resolver that throws, and also unit-check the pure
 * text helpers against the Rust fixtures. Run: `bun scripts/smoke-summarize.ts`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineState, fallbackSummary, parseSummary } from "@houston-ai/engine-core";
import { buildApp } from "../src/router.ts";

const home = mkdtempSync(join(tmpdir(), "ts-summ-"));
const token = "smoke-token";
// Resolver that always throws -> exercises the fallback path with no network.
const engine = new EngineState(
  { bindHost: "127.0.0.1", bindPort: 0, token, homeDir: home, docsDir: home },
  {
    modelResolver: () => {
      throw new Error("no model in test");
    },
  },
);
const app = buildApp(engine);

const fails: string[] = [];
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "OK  " : "MISS"} ${label}`);
  if (!cond) fails.push(label);
};

// Pure helpers match the Rust fixtures exactly.
check(
  fallbackSummary("Please write a long investor update for the whole team").title ===
    "Please write a long investor update for...",
  "fallback title trims on word boundary",
);
const emptyFb = fallbackSummary("   \n\t  ");
check(emptyFb.title === "New mission" && emptyFb.description === "New mission", "empty -> New mission");
const parsed = parseSummary(
  '```json\n{"title":"Plan the launch email campaign today please","description":"Draft launch copy."}\n```',
  fallbackSummary("fallback text"),
);
check(parsed.title === "Plan the launch email campaign today", "parse fenced JSON, 6-word title cap");
check(parsed.description === "Draft launch copy.", "parse description");
const emptyTitle = parseSummary('{"title":" ","description":" "}', fallbackSummary("Find better leads"));
check(emptyTitle.title === "Find better leads", "empty parsed title -> fallback");

// Route returns the deterministic fallback when the model can't run.
const res = await app.fetch(
  new Request("http://x/v1/sessions/summarize", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Fix the login bug on the marketing site", provider: "anthropic" }),
  }),
);
const body = (await res.json()) as { title: string; description: string };
console.log("  route ->", res.status, JSON.stringify(body));
check(res.status === 200, "summarize -> 200 even when model fails");
check(typeof body.title === "string" && body.title.length > 0, "non-empty title");
check(body.title.startsWith("Fix the login bug"), "fallback title derived from message");

console.log(fails.length === 0 ? "SUMMARIZE_OK" : "SUMMARIZE_FAIL");
process.exit(fails.length === 0 ? 0 : 1);
