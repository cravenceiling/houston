import { Hono } from "hono";
import {
  type EngineState,
  createAgent,
  createWorkspace,
  deleteAgent,
  deleteWorkspace,
  listAgents,
  listWorkspaces,
  renameAgent,
  renameWorkspace,
  updateAgentColor,
} from "@houston-ai/engine-core";
import {
  createAgentSchema,
  createWorkspaceSchema,
  renameAgentSchema,
  renameWorkspaceSchema,
  updateAgentSchema,
} from "@houston-ai/engine-protocol";
import { empty } from "../http.ts";

/**
 * Workspaces + workspace-scoped agent CRUD. Mirrors
 * `engine/houston-engine-server/src/routes/workspaces.rs`. Agent `create`
 * scaffolds the folder, skills, CLAUDE.md, and prompt skeleton. None of these
 * routes emit events (matching the Rust side; the client invalidates on success).
 */
export function workspaceRoutes(engine: EngineState): Hono {
  const root = () => engine.paths.workspacesRoot();
  const r = new Hono();

  r.get("/workspaces", (c) => c.json(listWorkspaces(root())));
  r.post("/workspaces", async (c) => {
    const body = createWorkspaceSchema.parse(await c.req.json());
    return c.json(createWorkspace(root(), body.name));
  });
  r.post("/workspaces/:id/rename", async (c) => {
    const body = renameWorkspaceSchema.parse(await c.req.json());
    return c.json(renameWorkspace(root(), c.req.param("id"), body.newName));
  });
  r.delete("/workspaces/:id", (c) => {
    deleteWorkspace(root(), c.req.param("id"));
    return empty();
  });

  r.get("/workspaces/:id/agents", (c) => c.json(listAgents(root(), c.req.param("id"))));
  r.post("/workspaces/:id/agents", async (c) => {
    const body = createAgentSchema.parse(await c.req.json());
    return c.json(createAgent(root(), c.req.param("id"), body));
  });
  r.post("/workspaces/:id/agents/:agentId/rename", async (c) => {
    const body = renameAgentSchema.parse(await c.req.json());
    return c.json(renameAgent(root(), c.req.param("id"), c.req.param("agentId"), body.newName));
  });
  r.delete("/workspaces/:id/agents/:agentId", (c) => {
    deleteAgent(root(), c.req.param("id"), c.req.param("agentId"));
    return empty();
  });
  r.patch("/workspaces/:id/agents/:agentId", async (c) => {
    const body = updateAgentSchema.parse(await c.req.json());
    return c.json(updateAgentColor(root(), c.req.param("id"), c.req.param("agentId"), body.color));
  });

  return r;
}
