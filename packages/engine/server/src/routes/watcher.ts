import { Hono } from "hono";
import type { EngineState } from "@houston-ai/engine-core";
import { watcherStartSchema } from "@houston-ai/engine-protocol";
import { empty } from "../http.ts";

/**
 * `/v1/watcher/*` — agent filesystem watcher lifecycle. Mirrors
 * `routes/watcher.rs`. The engine holds a single active watcher; `start`
 * replaces any prior one (switching agents), `stop` tears it down. Change
 * events flow into the engine event bus and fan out to subscribed WS clients.
 */
export function watcherRoutes(engine: EngineState): Hono {
  const r = new Hono();

  r.post("/watcher/start", async (c) => {
    const body = watcherStartSchema.parse(await c.req.json());
    engine.watcher.start(body.agentPath);
    return empty();
  });

  r.post("/watcher/stop", (c) => {
    engine.watcher.stop();
    return empty();
  });

  return r;
}
