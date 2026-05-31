#!/usr/bin/env bun
/**
 * `houston-engine` (TypeScript) binary entry point.
 *
 * Drop-in wire-compatible replacement for the Rust `houston-engine` sidecar:
 * binds a TCP listener, writes `<home>/engine.json`, prints the
 * `HOUSTON_ENGINE_LISTENING port=<p> token=<t>` banner (the ONLY thing on
 * stdout — all logs go to stderr), and self-terminates on stdin EOF so it can
 * never orphan after the desktop app exits. Mirrors
 * `engine/houston-engine-server/src/main.rs`.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  ENGINE_VERSION,
  EngineState,
  PROTOCOL_VERSION,
  configFromEnv,
  log,
} from "@houston-ai/engine-core";
import { buildApp } from "./router.ts";
import { makeWebSocketHandler, upgradeWs } from "./ws.ts";

function writeEngineJson(engine: EngineState, port: number): void {
  const tokenHash = createHash("sha256").update(engine.config.token).digest("hex");
  const manifest = {
    version: ENGINE_VERSION,
    protocol: PROTOCOL_VERSION,
    port,
    pid: process.pid,
    token_hash: tokenHash,
  };
  mkdirSync(engine.config.homeDir, { recursive: true });
  writeFileSync(engine.paths.engineJsonPath(), JSON.stringify(manifest, null, 2), { mode: 0o600 });
}

/**
 * Exit when the parent that launched us closes our stdin (graceful quit,
 * force-quit, crash). Skipped when stdin is a TTY (run by hand) or when
 * `HOUSTON_NO_PARENT_WATCHDOG=1` (standalone deploys own their lifecycle).
 */
function armParentWatchdog(): void {
  if (process.env.HOUSTON_NO_PARENT_WATCHDOG === "1") return;
  if (process.stdin.isTTY) return;
  const exit = () => process.exit(0);
  process.stdin.on("end", exit);
  process.stdin.on("close", exit);
  process.stdin.on("error", exit);
  process.stdin.resume();
}

function main(): void {
  const config = configFromEnv();
  const engine = new EngineState(config);
  const app = buildApp(engine);
  const websocket = makeWebSocketHandler(engine);

  const server = Bun.serve({
    hostname: config.bindHost,
    port: config.bindPort,
    fetch(req, srv) {
      if (new URL(req.url).pathname === "/v1/ws") {
        return upgradeWs(engine, req, srv);
      }
      return app.fetch(req);
    },
    websocket,
  });

  const port = server.port;
  if (port === undefined) throw new Error("engine server bound without a TCP port");
  writeEngineJson(engine, port);

  // The ONLY line written to stdout — the desktop supervisor parses it.
  process.stdout.write(`HOUSTON_ENGINE_LISTENING port=${port} token=${config.token}\n`);
  log.info(
    `houston-engine (ts) ${ENGINE_VERSION} (protocol v${PROTOCOL_VERSION}) listening on ${config.bindHost}:${port}`,
  );

  armParentWatchdog();
}

main();
