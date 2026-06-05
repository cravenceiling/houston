/**
 * In-process smoke test for `GET /v1/agent-configs`. Ports the Rust unit tests
 * from `agent_configs.rs`: an empty home creates the `agents/` dir and returns
 * `[]`; a mix of valid + malformed + bare dirs yields only the valid manifest.
 * Run: `bun scripts/smoke-agent-configs.ts`.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineState } from "@houston-ai/engine-core";
import { buildApp } from "../src/router.ts";

const home = mkdtempSync(join(tmpdir(), "ts-agent-configs-"));
const token = "smoke-token";
const engine = new EngineState({
  bindHost: "127.0.0.1",
  bindPort: 0,
  token,
  homeDir: home,
  docsDir: home,
});
const app = buildApp(engine);

async function get(path: string) {
  const res = await app.fetch(
    new Request(`http://x${path}`, { headers: { Authorization: `Bearer ${token}` } }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const fails: string[] = [];
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "OK  " : "MISS"} ${label}`);
  if (!cond) fails.push(label);
};

// Empty home → creates agents/ and returns [].
const empty = await get("/v1/agent-configs");
check(empty.status === 200 && Array.isArray(empty.body) && empty.body.length === 0, "empty home -> []");
check(existsSync(join(home, "agents")), "agents/ dir created");

// Seed a valid manifest, a malformed one, and a bare dir.
const agents = join(home, "agents");
mkdirSync(join(agents, "alpha"), { recursive: true });
writeFileSync(join(agents, "alpha", "houston.json"), '{"name":"alpha","version":"1"}');
mkdirSync(join(agents, "broken"), { recursive: true });
writeFileSync(join(agents, "broken", "houston.json"), "{not json");
mkdirSync(join(agents, "bare"), { recursive: true });

const list = await get("/v1/agent-configs");
check(list.status === 200 && list.body.length === 1, "valid+broken+bare -> 1 entry");
check(list.body?.[0]?.config?.name === "alpha", "config parsed (name=alpha)");
check(
  typeof list.body?.[0]?.path === "string" && list.body[0].path.endsWith("alpha"),
  "path is the agent dir",
);

console.log(fails.length === 0 ? "AGENT_CONFIGS_OK" : "AGENT_CONFIGS_FAIL");
process.exit(fails.length === 0 ? 0 : 1);
