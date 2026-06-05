import { Hono } from "hono";
import {
  composioApps,
  composioCliInstalled,
  composioConnectedToolkits,
  composioStatus,
} from "@houston-ai/engine-core";
import { ApiError } from "../errors.ts";

/**
 * `/v1/composio/*` — read-only status surface. Mirrors the infallible GET
 * handlers of `routes/composio.rs` so the integrations panel renders a calm
 * "not connected" state. Login / connect / install actions need the bundled
 * composio CLI and land with the composio milestone — they answer with an
 * honest UNAVAILABLE (503) rather than a bare 404.
 */
export function composioRoutes(): Hono {
  const r = new Hono();

  r.get("/composio/status", (c) => c.json(composioStatus()));
  r.get("/composio/cli-installed", (c) => c.json({ installed: composioCliInstalled() }));
  r.get("/composio/apps", (c) => c.json(composioApps()));
  r.get("/composio/connections", (c) => c.json(composioConnectedToolkits()));

  const notYet = () => {
    throw new ApiError("UNAVAILABLE", "Composio integrations aren't available on this engine yet.");
  };
  r.post("/composio/cli", notYet);
  r.post("/composio/login", notYet);
  r.post("/composio/login/complete", notYet);
  r.post("/composio/logout", notYet);
  r.post("/composio/connections", notYet);
  r.post("/composio/connections/disconnect", notYet);
  r.post("/composio/connections/reconnect", notYet);
  r.post("/composio/connections/watch", notYet);

  return r;
}
