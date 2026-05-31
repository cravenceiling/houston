/**
 * HTTP router assembly.
 *
 * Mirrors `engine/houston-engine-server/src/lib.rs::build_router`: nest the
 * route modules under `/v1`, wrap them in bearer auth + the engine-version
 * header, and apply permissive CORS on the outside. The WebSocket route
 * (`/v1/ws`) is handled in `main.ts` before this app, because Bun's native
 * upgrade happens at the `Bun.serve` `fetch` level.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { HEADER_ENGINE_VERSION } from "@houston-ai/engine-protocol";
import { ENGINE_VERSION, type EngineState } from "@houston-ai/engine-core";
import { authMiddleware } from "./auth.ts";
import { onError } from "./errors.ts";
import { healthRoutes } from "./routes/health.ts";
import { workspaceRoutes } from "./routes/workspaces.ts";
import { agentFileRoutes } from "./routes/files.ts";
import { sessionRoutes } from "./routes/sessions.ts";

export function buildApp(engine: EngineState): Hono {
  const app = new Hono();

  // Permissive CORS (the desktop WKWebView is cross-origin to 127.0.0.1:<port>;
  // trimming this has historically broken PATCH/PUT preflights). Unset
  // allowHeaders reflects the request's Access-Control-Request-Headers.
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH", "OPTIONS"],
      exposeHeaders: [HEADER_ENGINE_VERSION],
    }),
  );

  // Engine-version header on every response.
  app.use("*", async (c, next) => {
    await next();
    c.header(HEADER_ENGINE_VERSION, ENGINE_VERSION);
  });

  // Bearer auth on every /v1 route (including /health, which the supervisor
  // polls with the token).
  app.use("/v1/*", authMiddleware(engine));

  app.onError(onError);

  app.route("/v1", healthRoutes());
  app.route("/v1", workspaceRoutes(engine));
  app.route("/v1", agentFileRoutes(engine));
  app.route("/v1", sessionRoutes(engine));

  return app;
}
