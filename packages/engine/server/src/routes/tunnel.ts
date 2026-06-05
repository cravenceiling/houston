import { Hono } from "hono";
import { tunnelStatus } from "@houston-ai/engine-core";
import { ApiError } from "../errors.ts";

/**
 * `/v1/tunnel/*` — read-only status. Mirrors the `tunnel_runtime = None` branch
 * of `routes/tunnel.rs`: status is the disconnected default; pairing / reset
 * need the relay-backed tunnel runtime and answer with an honest UNAVAILABLE
 * until the mobile milestone.
 */
export function tunnelRoutes(): Hono {
  const r = new Hono();
  r.get("/tunnel/status", (c) => c.json(tunnelStatus()));

  const notYet = () => {
    throw new ApiError("UNAVAILABLE", "Phone pairing isn't available on this engine yet.");
  };
  r.post("/tunnel/pairing", notYet);
  r.post("/tunnel/reset-access", notYet);

  return r;
}
