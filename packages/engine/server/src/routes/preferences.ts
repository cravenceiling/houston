import { Hono } from "hono";
import type { EngineState } from "@houston-ai/engine-core";
import { preferenceValueSchema } from "@houston-ai/engine-protocol";
import { empty } from "../http.ts";

/** String KV preferences (DB-backed). Mirrors `routes/preferences.rs`. */
export function preferenceRoutes(engine: EngineState): Hono {
  const r = new Hono();
  r.get("/preferences/:key", (c) => c.json({ value: engine.db.getPreference(c.req.param("key")) }));
  r.put("/preferences/:key", async (c) => {
    const body = preferenceValueSchema.parse(await c.req.json());
    engine.db.setPreference(c.req.param("key"), body.value);
    return empty();
  });
  return r;
}
