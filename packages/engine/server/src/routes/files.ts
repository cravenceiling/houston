import { Hono } from "hono";
import {
  type EngineState,
  createFolder,
  deleteFile,
  listActivities,
  listProjectFiles,
  readAgentFile,
  readConfig,
  readProjectFile,
  renameFile,
  resolveAgentDir,
  writeAgentFile,
  writeConfig,
} from "@houston-ai/engine-core";
import {
  createFolderBodySchema,
  projectConfigSchema,
  readAgentFileBodySchema,
  renameFileBodySchema,
  writeAgentFileBodySchema,
} from "@houston-ai/engine-protocol";
import { ApiError } from "../errors.ts";
import { empty } from "../http.ts";

/**
 * Agent-data files, the user-facing project-file browser, agent config, and
 * the activity list. Mirrors `routes/agent_files.rs` + the agent-data slice of
 * `routes/agents.rs`. Request bodies are snake_case (`agent_path`/`rel_path`);
 * project-file listing + delete take query params, matching the engine-client.
 */
export function agentFileRoutes(engine: EngineState): Hono {
  const r = new Hono();
  const dir = (agentPath: string) => resolveAgentDir(engine.paths, agentPath);
  const requireQuery = (value: string | undefined, name: string): string => {
    if (!value) throw ApiError.badRequest(`${name} is required`);
    return value;
  };

  // -- typed agent-data files --
  r.post("/agents/files/read", async (c) => {
    const b = readAgentFileBodySchema.parse(await c.req.json());
    return c.json({ content: readAgentFile(dir(b.agent_path), b.rel_path) });
  });
  r.post("/agents/files/write", async (c) => {
    const b = writeAgentFileBodySchema.parse(await c.req.json());
    const event = writeAgentFile(dir(b.agent_path), b.agent_path, b.rel_path, b.content);
    if (event) engine.events.emit(event);
    return empty();
  });

  // -- user-facing project files --
  r.get("/agents/files", (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    return c.json(listProjectFiles(dir(agentPath)));
  });
  r.post("/agents/files/read-project", async (c) => {
    const b = readAgentFileBodySchema.parse(await c.req.json());
    return c.json({ content: readProjectFile(dir(b.agent_path), b.rel_path) });
  });
  r.post("/agents/files/rename", async (c) => {
    const b = renameFileBodySchema.parse(await c.req.json());
    renameFile(dir(b.agent_path), b.rel_path, b.new_name);
    engine.events.emit({ type: "FilesChanged", data: { agent_path: b.agent_path } });
    return empty();
  });
  r.delete("/agents/files", (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    const relPath = requireQuery(c.req.query("rel_path"), "rel_path");
    deleteFile(dir(agentPath), relPath);
    engine.events.emit({ type: "FilesChanged", data: { agent_path: agentPath } });
    return empty();
  });
  r.post("/agents/files/folder", async (c) => {
    const b = createFolderBodySchema.parse(await c.req.json());
    const created = createFolder(dir(b.agent_path), b.folder_name);
    engine.events.emit({ type: "FilesChanged", data: { agent_path: b.agent_path } });
    return c.json({ created });
  });

  // -- agent config --
  r.get("/agents/config", (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    return c.json(readConfig(dir(agentPath)));
  });
  r.put("/agents/config", async (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    const cfg = projectConfigSchema.parse(await c.req.json());
    writeConfig(dir(agentPath), cfg);
    engine.events.emit({ type: "ConfigChanged", data: { agent_path: agentPath } });
    return c.json(cfg);
  });

  // -- activities (read) --
  r.get("/agents/activities", (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    return c.json(listActivities(dir(agentPath)));
  });

  return r;
}
