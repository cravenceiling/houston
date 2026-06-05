/**
 * In-process smoke test for the calm status reads that silence the app's
 * boot-time toast storm: composio (status / cli-installed / apps / connections),
 * tunnel status, and store catalog/search. Composio + tunnel report the
 * not-configured defaults; the store fetch is pointed at a local fixture so we
 * assert real parsing without hitting the network.
 * Run: `bun scripts/smoke-status.ts`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineState } from "@houston-ai/engine-core";
import { buildApp } from "../src/router.ts";

const home = mkdtempSync(join(tmpdir(), "ts-status-"));
const token = "smoke-token";
const engine = new EngineState({
  bindHost: "127.0.0.1",
  bindPort: 0,
  token,
  homeDir: home,
  docsDir: home,
});
const app = buildApp(engine);

async function call(method: string, path: string) {
  const res = await app.fetch(
    new Request(`http://x${path}`, { method, headers: { Authorization: `Bearer ${token}` } }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const fails: string[] = [];
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "OK  " : "MISS"} ${label}`);
  if (!cond) fails.push(label);
};

// -- composio: calm reads, never a false "ok" --
const status = await call("GET", "/v1/composio/status");
const cli = await call("GET", "/v1/composio/cli-installed");
const apps = await call("GET", "/v1/composio/apps");
const conns = await call("GET", "/v1/composio/connections");
check(
  status.status === 200 && ["not_installed", "needs_auth"].includes(status.body?.status),
  "composio status is not_installed|needs_auth (never a false ok)",
);
check(cli.status === 200 && typeof cli.body?.installed === "boolean", "cli-installed -> { installed: bool }");
check(
  (status.body?.status === "not_installed") === (cli.body?.installed === false),
  "status and cli-installed agree",
);
check(apps.status === 200 && Array.isArray(apps.body) && apps.body.length === 0, "composio apps -> []");
check(conns.status === 200 && Array.isArray(conns.body) && conns.body.length === 0, "composio connections -> []");

// connect/login actions are honest 503, not a confusing 404.
const connect = await call("POST", "/v1/composio/login");
check(connect.status === 503, "composio/login -> 503 (not yet)");

// -- tunnel: disconnected default --
const tunnel = await call("GET", "/v1/tunnel/status");
check(
  tunnel.status === 200 &&
    tunnel.body?.connected === false &&
    tunnel.body?.tunnelId === null &&
    tunnel.body?.publicHost === null &&
    tunnel.body?.lastActivityMs === null,
  "tunnel status disconnected default",
);
const pairing = await call("POST", "/v1/tunnel/pairing");
check(pairing.status === 503, "tunnel/pairing -> 503 (not yet)");

// -- store: parse a fixture catalog (no network) --
const sample = {
  id: "sample",
  name: "Sample Agent",
  description: "A sample",
  category: "productivity",
  author: "houston",
  tags: ["demo"],
  icon_url: "https://x/icon.png",
  integrations: [],
  repo: "gethouston/sample",
  installs: 7,
  registered_at: "2026-01-01T00:00:00Z",
  bundled: false,
};
const fixture = Bun.serve({
  port: 0,
  fetch(req) {
    const u = new URL(req.url);
    if (u.pathname.startsWith("/bad/")) return Response.json({}); // malformed: no `agents`
    if (u.pathname.endsWith("/catalog") || u.pathname.endsWith("/search")) {
      return Response.json({ agents: [sample] });
    }
    return new Response("not found", { status: 404 });
  },
});
process.env.HOUSTON_STORE_API = `http://127.0.0.1:${fixture.port}/api`;

const catalog = await call("GET", "/v1/store/catalog");
check(
  catalog.status === 200 && catalog.body?.length === 1 && catalog.body[0].id === "sample",
  "store catalog parsed from fixture",
);
check(Array.isArray(catalog.body?.[0]?.tags) && catalog.body[0].installs === 7, "listing fields preserved");

const search = await call("GET", "/v1/store/search?q=demo");
check(search.status === 200 && search.body?.length === 1, "store search parsed from fixture");

// Required `q` param: absent -> 400 (matches axum's required SearchQuery).
const noQuery = await call("GET", "/v1/store/search");
check(noQuery.status === 400, "store/search without q -> 400");

// Malformed backend response (no `agents`) surfaces as 500, never a silent [].
process.env.HOUSTON_STORE_API = `http://127.0.0.1:${fixture.port}/bad`;
const malformed = await call("GET", "/v1/store/catalog");
check(malformed.status === 500, "malformed catalog (no agents) -> 500, not silent []");
process.env.HOUSTON_STORE_API = `http://127.0.0.1:${fixture.port}/api`;

const install = await call("POST", "/v1/store/installs");
check(install.status === 503, "store/installs -> 503 (not yet)");
const ghInstall = await call("POST", "/v1/agents/install-from-github");
check(ghInstall.status === 503, "agents/install-from-github -> 503 (not yet)");

fixture.stop();
delete process.env.HOUSTON_STORE_API;

console.log(fails.length === 0 ? "STATUS_OK" : "STATUS_FAIL");
process.exit(fails.length === 0 ? 0 : 1);
