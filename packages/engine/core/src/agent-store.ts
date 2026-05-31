/**
 * Typed `.houston/<type>/<type>.json` store + agent config + board activity.
 *
 * Port of `houston-engine-core/src/agents/{store,config}.rs`. Reads return a
 * default for missing/empty files and self-heal trailing-garbage corruption by
 * backing up the bad file and rewriting the recovered prefix.
 */

import type { Activity, ActivityUpdate, NewActivity, ProjectConfig } from "@houston-ai/engine-protocol";
import { randomUUID } from "node:crypto";
import { readAgentFile, writeFileAtomic } from "./agent-files.ts";
import { CoreError } from "./error.ts";
import { log } from "./log.ts";

function relForType(name: string): string {
  return `.houston/${name}/${name}.json`;
}

/** Read `.houston/<name>/<name>.json`, returning `fallback` if missing/empty. */
export function readJson<T>(root: string, name: string, fallback: T): T {
  const rel = relForType(name);
  const contents = readAgentFile(root, rel);
  if (contents.trim().length === 0) return fallback;
  try {
    return JSON.parse(contents) as T;
  } catch (err) {
    const repaired = repairJson<T>(root, name, rel, contents);
    if (repaired !== undefined) return repaired;
    throw err instanceof Error
      ? CoreError.internal(`failed to parse ${rel}: ${err.message}`)
      : (err as Error);
  }
}

/** Atomically write `.houston/<name>/<name>.json`. */
export function writeJson<T>(root: string, name: string, data: T): void {
  writeFileAtomic(root, relForType(name), JSON.stringify(data, null, 2));
}

function repairJson<T>(root: string, name: string, rel: string, contents: string): T | undefined {
  const closers: number[] = [];
  for (let i = 0; i < contents.length; i++) {
    const c = contents[i];
    if (c === "]" || c === "}") closers.push(i);
  }
  for (let k = closers.length - 1; k >= 0; k--) {
    const end = closers[k];
    const trailing = contents.slice(end + 1).trim();
    if (trailing.length === 0) continue; // only the trailing-garbage shape is repairable here
    try {
      const value = JSON.parse(contents.slice(0, end + 1)) as T;
      backupAndWrite(root, name, contents, value);
      log.warn(`[agent-store] repaired ${rel} by removing trailing data`);
      return value;
    } catch {
      /* keep scanning earlier closers */
    }
  }
  return undefined;
}

function backupAndWrite<T>(root: string, name: string, contents: string, value: T): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  const backupRel = `.houston/${name}/${name}.json.corrupt-${stamp}-${randomUUID()}.bak`;
  writeFileAtomic(root, backupRel, contents);
  writeJson(root, name, value);
}

// ---------------------------------------------------------------------------
// Config (`.houston/config/config.json`)
// ---------------------------------------------------------------------------

/** Read the agent's project config, honoring the legacy `claude_*` aliases. */
export function readConfig(root: string): ProjectConfig {
  const contents = readAgentFile(root, ".houston/config/config.json");
  if (contents.trim().length === 0) return {};
  const cfg = JSON.parse(contents) as ProjectConfig & {
    claude_model?: string;
    claude_effort?: string;
  };
  if (cfg.model === undefined && typeof cfg.claude_model === "string") cfg.model = cfg.claude_model;
  if (cfg.effort === undefined && typeof cfg.claude_effort === "string") {
    cfg.effort = cfg.claude_effort;
  }
  return cfg;
}

export function writeConfig(root: string, config: ProjectConfig): void {
  writeJson(root, "config", config);
}

// ---------------------------------------------------------------------------
// Board activity (`.houston/activity/activity.json`)
// ---------------------------------------------------------------------------

export function listActivities(root: string): Activity[] {
  return readJson<Activity[]>(root, "activity", []);
}

/** Create a board activity (mission). Bound to its session via `activity-{id}`. */
export function createActivity(root: string, input: NewActivity): Activity {
  const items = listActivities(root);
  const id = randomUUID();
  const activity: Activity = {
    id,
    title: input.title,
    description: input.description ?? "",
    status: "running",
    claude_session_id: null,
    session_key: `activity-${id}`,
    agent: input.agent,
    worktree_path: input.worktree_path ?? null,
    updated_at: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
  };
  items.push(activity);
  writeJson(root, "activity", items);
  return activity;
}

export function updateActivity(root: string, id: string, updates: ActivityUpdate): Activity {
  const items = listActivities(root);
  const item = items.find((a) => a.id === id);
  if (!item) throw CoreError.notFound(`activity ${id}`);
  if (updates.title !== undefined) item.title = updates.title;
  if (updates.description !== undefined) item.description = updates.description;
  if (updates.status !== undefined) item.status = updates.status;
  if (updates.claude_session_id !== undefined) item.claude_session_id = updates.claude_session_id;
  if (updates.session_key !== undefined) item.session_key = updates.session_key;
  if (updates.agent !== undefined) item.agent = updates.agent;
  if (updates.worktree_path !== undefined) item.worktree_path = updates.worktree_path;
  if (updates.routine_id !== undefined) item.routine_id = updates.routine_id;
  if (updates.routine_run_id !== undefined) item.routine_run_id = updates.routine_run_id;
  if (updates.provider !== undefined) item.provider = updates.provider;
  if (updates.model !== undefined) item.model = updates.model;
  item.updated_at = new Date().toISOString();
  writeJson(root, "activity", items);
  return item;
}

export function deleteActivity(root: string, id: string): void {
  const items = listActivities(root);
  const next = items.filter((a) => a.id !== id);
  if (next.length === items.length) throw CoreError.notFound(`activity ${id}`);
  writeJson(root, "activity", next);
}

/**
 * Flip the board status of the activity addressed by `sessionKey`. An activity
 * is addressed either by its explicit `session_key` or by the `activity-<id>`
 * convention. Best-effort: a no-op (returns false) when no activity matches,
 * which is correct for sessions started without a board activity.
 */
export function setActivityStatusBySessionKey(
  root: string,
  sessionKey: string,
  status: string,
): boolean {
  const items = listActivities(root);
  const impliedId = sessionKey.startsWith("activity-") ? sessionKey.slice("activity-".length) : null;
  const item = items.find(
    (a) => a.session_key === sessionKey || (impliedId !== null && a.id === impliedId),
  );
  if (!item) return false;
  // Backfill the session_key when matched via the `activity-{id}` convention so
  // future lookups hit the fast path.
  if (item.session_key !== sessionKey) item.session_key = sessionKey;
  if (item.status !== status) {
    item.status = status;
    item.updated_at = new Date().toISOString();
  }
  writeJson(root, "activity", items);
  return true;
}
