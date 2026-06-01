import { Hono } from "hono";
import {
  type EngineState,
  createActivity,
  createFolder,
  createRoutine,
  createRoutineRun,
  deleteActivity,
  deleteFile,
  deleteRoutine,
  listActivities,
  listProjectFiles,
  listRoutineRuns,
  listRoutineRunsForRoutine,
  listRoutines,
  readAgentFile,
  readConfig,
  readProjectFile,
  renameFile,
  resolveAgentDir,
  updateActivity,
  updateRoutine,
  updateRoutineRun,
  writeAgentFile,
  writeConfig,
} from "@houston-ai/engine-core";
import {
  activityUpdateSchema,
  createFolderBodySchema,
  newActivitySchema,
  newRoutineSchema,
  projectConfigSchema,
  readAgentFileBodySchema,
  renameFileBodySchema,
  routineRunUpdateSchema,
  routineUpdateSchema,
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

  // -- activities (board missions) --
  r.get("/agents/activities", (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    return c.json(listActivities(dir(agentPath)));
  });
  r.post("/agents/activities", async (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    const body = newActivitySchema.parse(await c.req.json());
    const activity = createActivity(dir(agentPath), body);
    engine.events.emit({ type: "ActivityChanged", data: { agent_path: agentPath } });
    return c.json(activity);
  });
  r.patch("/agents/activities/:id", async (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    const body = activityUpdateSchema.parse(await c.req.json());
    const activity = updateActivity(dir(agentPath), c.req.param("id"), body);
    engine.events.emit({ type: "ActivityChanged", data: { agent_path: agentPath } });
    return c.json(activity);
  });
  r.delete("/agents/activities/:id", (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    deleteActivity(dir(agentPath), c.req.param("id"));
    engine.events.emit({ type: "ActivityChanged", data: { agent_path: agentPath } });
    return empty();
  });

  // -- routines (scheduled tasks) --
  const routinesChanged = (agentPath: string) =>
    engine.events.emit({ type: "RoutinesChanged", data: { agent_path: agentPath } });
  const routineRunsChanged = (agentPath: string) =>
    engine.events.emit({ type: "RoutineRunsChanged", data: { agent_path: agentPath } });

  r.get("/agents/routines", (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    return c.json(listRoutines(dir(agentPath)));
  });
  r.post("/agents/routines", async (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    const body = newRoutineSchema.parse(await c.req.json());
    const routine = createRoutine(dir(agentPath), body);
    routinesChanged(agentPath);
    return c.json(routine);
  });
  r.patch("/agents/routines/:id", async (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    const body = routineUpdateSchema.parse(await c.req.json());
    const routine = updateRoutine(dir(agentPath), c.req.param("id"), body);
    routinesChanged(agentPath);
    return c.json(routine);
  });
  r.delete("/agents/routines/:id", (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    deleteRoutine(dir(agentPath), c.req.param("id"));
    routinesChanged(agentPath);
    return empty();
  });

  // -- routine runs (execution history) --
  r.get("/agents/routine-runs", (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    const routineId = c.req.query("routine_id");
    const root = dir(agentPath);
    return c.json(routineId ? listRoutineRunsForRoutine(root, routineId) : listRoutineRuns(root));
  });
  r.post("/agents/routine-runs", async (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    const { routine_id } = (await c.req.json()) as { routine_id?: string };
    if (!routine_id) throw ApiError.badRequest("routine_id is required");
    const run = createRoutineRun(dir(agentPath), routine_id);
    routineRunsChanged(agentPath);
    return c.json(run);
  });
  r.patch("/agents/routine-runs/:id", async (c) => {
    const agentPath = requireQuery(c.req.query("agent_path"), "agent_path");
    const body = routineRunUpdateSchema.parse(await c.req.json());
    const run = updateRoutineRun(dir(agentPath), c.req.param("id"), body);
    routineRunsChanged(agentPath);
    return c.json(run);
  });

  return r;
}
