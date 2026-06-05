import { Hono } from "hono";
import { type EngineState, listInstalledConfigs } from "@houston-ai/engine-core";

/** `GET /v1/agent-configs` — installed agent manifests. Mirrors `routes/agent_configs.rs`. */
export function agentConfigRoutes(engine: EngineState): Hono {
  const r = new Hono();
  r.get("/agent-configs", (c) => c.json(listInstalledConfigs(engine.paths.homeDir)));
  return r;
}
