import { Hono } from "hono";
import { ENGINE_VERSION, PROTOCOL_VERSION } from "@houston-ai/engine-core";

/** `GET /v1/health`, `GET /v1/version`. Both require a valid bearer token — the
 *  desktop supervisor polls `/v1/health` with the token before mounting. */
export function healthRoutes(): Hono {
  const r = new Hono();
  r.get("/health", (c) => c.json({ status: "ok", version: ENGINE_VERSION, protocol: PROTOCOL_VERSION }));
  r.get("/version", (c) => c.json({ engine: ENGINE_VERSION, protocol: PROTOCOL_VERSION, build: null }));
  return r;
}
