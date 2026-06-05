import { Hono } from "hono";
import {
  type EngineState,
  listAllConversations,
  listConversations,
  resolveAgentDir,
} from "@houston-ai/engine-core";
import {
  conversationsListAllSchema,
  conversationsListSchema,
} from "@houston-ai/engine-protocol";

/**
 * `/v1/conversations/*` — read-only conversation listing derived from each
 * agent's activity board. Mirrors `routes/conversations.rs`. Request bodies are
 * camelCase (`agentPath` / `agentPaths`).
 */
export function conversationRoutes(engine: EngineState): Hono {
  const r = new Hono();
  const dir = (agentPath: string) => resolveAgentDir(engine.paths, agentPath);

  r.post("/conversations/list", async (c) => {
    const body = conversationsListSchema.parse(await c.req.json());
    return c.json(listConversations(dir(body.agentPath)));
  });

  r.post("/conversations/list-all", async (c) => {
    const body = conversationsListAllSchema.parse(await c.req.json());
    return c.json(listAllConversations(body.agentPaths.map(dir)));
  });

  return r;
}
