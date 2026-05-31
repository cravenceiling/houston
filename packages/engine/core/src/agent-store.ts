/**
 * Typed `.houston/<type>/<type>.json` store + agent config + board activity.
 *
 * Port of `houston-engine-core/src/agents/{store,config}.rs`. Reads return a
 * default for missing/empty files and self-heal trailing-garbage corruption by
 * backing up the bad file and rewriting the recovered prefix.
 */

import type { Activity, ProjectConfig } from "@houston-ai/engine-protocol";
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
  let changed = false;
  for (const a of items) {
    const key = a.session_key ?? `activity-${a.id}`;
    if (key === sessionKey) {
      a.status = status;
      a.updated_at = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) writeJson(root, "activity", items);
  return changed;
}
