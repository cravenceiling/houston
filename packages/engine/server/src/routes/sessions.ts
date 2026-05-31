import { Hono } from "hono";
import { type EngineState, cancelTurn, loadHistory, startTurn } from "@houston-ai/engine-core";
import {
  onboardingStartRequestSchema,
  sessionStartRequestSchema,
} from "@houston-ai/engine-protocol";
import { ApiError } from "../errors.ts";

/**
 * Chat sessions. Mirrors `routes/sessions.rs`. `:agentPath` is one
 * percent-encoded segment (Hono URL-decodes it). Start returns immediately
 * (`{ sessionKey }`); the turn streams over the `session:<key>` WS topic. The
 * `:cancel` action suffix is parsed off the key segment, matching the wire.
 */
export function sessionRoutes(engine: EngineState): Hono {
  const r = new Hono();

  r.post("/agents/:agentPath/sessions", async (c) => {
    const agentPath = c.req.param("agentPath");
    const body = sessionStartRequestSchema.parse(await c.req.json());
    startTurn(engine, {
      agentPath,
      sessionKey: body.sessionKey,
      prompt: body.prompt,
      systemPrompt: body.systemPrompt,
      source: body.source,
      workingDir: body.workingDir,
      provider: body.provider,
      model: body.model,
      effort: body.effort,
    });
    return c.json({ sessionKey: body.sessionKey });
  });

  r.post("/agents/:agentPath/sessions/onboarding", async (c) => {
    const agentPath = c.req.param("agentPath");
    const body = onboardingStartRequestSchema.parse(await c.req.json());
    startTurn(engine, {
      agentPath,
      sessionKey: body.sessionKey,
      prompt: "Let's get started.",
      source: "onboarding",
      onboarding: true,
    });
    return c.json({ sessionKey: body.sessionKey });
  });

  r.post("/agents/:agentPath/sessions/:keyAction", (c) => {
    const keyAction = c.req.param("keyAction");
    if (!keyAction.endsWith(":cancel")) {
      throw ApiError.badRequest(`unsupported session action: ${keyAction}`);
    }
    const sessionKey = keyAction.slice(0, -":cancel".length);
    const cancelled = cancelTurn(engine, c.req.param("agentPath"), sessionKey);
    return c.json({ cancelled });
  });

  r.get("/agents/:agentPath/sessions/:key/history", (c) => {
    return c.json(loadHistory(engine, c.req.param("agentPath"), c.req.param("key")));
  });

  return r;
}
