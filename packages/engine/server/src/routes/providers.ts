import { Hono } from "hono";
import type { EngineState } from "@houston-ai/engine-core";
import { loginCodeSchema } from "@houston-ai/engine-protocol";
import { empty } from "../http.ts";

/**
 * Provider OAuth login. Mirrors `routes/providers.rs`, backed by pi-ai
 * `./oauth`. `login` launches the browser-approve loopback flow and returns
 * immediately; the sign-in URL arrives via the `ProviderLoginUrl` WS event and
 * the outcome via `ProviderLoginComplete`. `?deviceAuth=true` requests the
 * headless device-code flow for remote clients.
 */
export function providerRoutes(engine: EngineState): Hono {
  const r = new Hono();

  r.get("/providers/:name/status", (c) => c.json(engine.auth.status(c.req.param("name"))));

  r.post("/providers/:name/login", (c) => {
    engine.auth.startLogin(c.req.param("name"), c.req.query("deviceAuth") === "true");
    return empty();
  });

  r.post("/providers/:name/login/code", async (c) => {
    const body = loginCodeSchema.parse(await c.req.json());
    engine.auth.submitCode(c.req.param("name"), body.code);
    return empty();
  });

  r.post("/providers/:name/login/cancel", (c) => {
    engine.auth.cancelLogin(c.req.param("name"));
    return empty();
  });

  r.post("/providers/:name/logout", (c) => {
    engine.auth.logout(c.req.param("name"));
    return empty();
  });

  return r;
}
