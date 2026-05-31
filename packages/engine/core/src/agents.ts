/**
 * Workspace-scoped agent listing + metadata CRUD.
 *
 * Port of `houston-engine-core/src/agents_crud.rs`. Each agent lives at
 * `<root>/<workspace_name>/<agent_name>/` with metadata in
 * `.houston/agent.json`; linked projects are symlinks to a real path. The
 * `folderPath` returned is the canonical (symlink-resolved) path, which the
 * desktop store relies on to repoint its file watcher.
 *
 * `create` (which seeds CLAUDE.md, `.agents/skills`, and the prompt scaffold
 * via the prompt module) lands with the session/prompt milestone (M3); listing
 * and metadata mutations are here.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  lstatSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { basename, join } from "node:path";
import { CoreError } from "./error.ts";
import { log } from "./log.ts";
import { readAllWorkspaces } from "./workspaces.ts";

export interface AgentMeta {
  id: string;
  name?: string | null;
  config_id: string;
  color?: string | null;
  created_at: string;
  last_opened_at?: string | null;
}

export interface Agent {
  id: string;
  name: string;
  folderPath: string;
  configId: string;
  color: string | null;
  createdAt: string;
  lastOpenedAt: string | null;
}

function houstonDir(folder: string): string {
  return join(folder, ".houston");
}

function agentJsonPath(folder: string): string {
  return join(houstonDir(folder), "agent.json");
}

function readAgentMeta(folder: string): AgentMeta {
  return JSON.parse(readFileSync(agentJsonPath(folder), "utf-8")) as AgentMeta;
}

function writeAgentMeta(folder: string, meta: AgentMeta): void {
  const dir = houstonDir(folder);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, "agent.json");
  const tmp = join(dir, "agent.json.tmp");
  writeFileSync(tmp, JSON.stringify(meta, null, 2));
  renameSync(tmp, target);
}

function metaToAgent(folder: string, meta: AgentMeta): Agent {
  const name = meta.name ?? basename(folder);
  let realPath = folder;
  try {
    realPath = realpathSync(folder);
  } catch {
    realPath = folder;
  }
  return {
    id: meta.id,
    name,
    folderPath: realPath,
    configId: meta.config_id,
    color: meta.color ?? null,
    createdAt: meta.created_at,
    lastOpenedAt: meta.last_opened_at ?? null,
  };
}

/** Resolve a workspace folder from `(root, workspace_id)`. */
function resolveWsFolder(root: string, workspaceId: string): string {
  const ws = readAllWorkspaces(root).find((w) => w.id === workspaceId);
  if (!ws) throw CoreError.notFound(`Workspace not found: ${workspaceId}`);
  const folder = join(root, ws.name);
  mkdirSync(folder, { recursive: true });
  return folder;
}

function findAgentById(wsDir: string, id: string): string {
  for (const ent of readdirSync(wsDir, { withFileTypes: true })) {
    const full = join(wsDir, ent.name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (!existsSync(agentJsonPath(full))) continue;
    try {
      if (readAgentMeta(full).id === id) return full;
    } catch {
      /* skip unreadable */
    }
  }
  throw CoreError.notFound(`Agent not found: ${id}`);
}

/** List agents within a workspace, most-recently-opened first. */
export function listAgents(root: string, workspaceId: string): Agent[] {
  const wsDir = resolveWsFolder(root, workspaceId);
  const agents: Agent[] = [];
  for (const ent of readdirSync(wsDir, { withFileTypes: true })) {
    const name = ent.name;
    if (name.startsWith(".")) continue;
    const full = join(wsDir, name);
    if (ent.isSymbolicLink() && !existsSync(full)) {
      log.warn(`[agents] removing dangling symlink: ${name}`);
      try {
        unlinkSync(full);
      } catch {
        /* best effort */
      }
      continue;
    }
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (!existsSync(agentJsonPath(full))) continue;
    try {
      agents.push(metaToAgent(full, readAgentMeta(full)));
    } catch (e) {
      log.warn(`[agents] skipping ${name}: ${e}`);
    }
  }
  agents.sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""));
  return agents;
}

export function deleteAgent(root: string, workspaceId: string, id: string): void {
  const wsDir = resolveWsFolder(root, workspaceId);
  const folder = findAgentById(wsDir, id);
  if (lstatSync(folder).isSymbolicLink()) {
    unlinkSync(folder);
  } else {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function renameAgent(root: string, workspaceId: string, id: string, newName: string): Agent {
  const wsDir = resolveWsFolder(root, workspaceId);
  const oldFolder = findAgentById(wsDir, id);
  const newLink = join(wsDir, newName);
  if (existsSync(newLink) && oldFolder !== newLink) {
    throw CoreError.conflict(`An agent named "${newName}" already exists`);
  }
  if (oldFolder === newLink) {
    return metaToAgent(oldFolder, readAgentMeta(oldFolder));
  }
  if (lstatSync(oldFolder).isSymbolicLink()) {
    const target = readlinkSync(oldFolder);
    unlinkSync(oldFolder);
    symlinkSync(target, newLink);
    const meta = readAgentMeta(newLink);
    meta.name = newName;
    writeAgentMeta(newLink, meta);
    return metaToAgent(newLink, meta);
  }
  renameSync(oldFolder, newLink);
  return metaToAgent(newLink, readAgentMeta(newLink));
}

export function updateAgentColor(
  root: string,
  workspaceId: string,
  id: string,
  color: string,
): Agent {
  const wsDir = resolveWsFolder(root, workspaceId);
  const folder = findAgentById(wsDir, id);
  const trimmed = color.trim();
  if (trimmed.length === 0) throw CoreError.badRequest("Agent color is required");
  const meta = readAgentMeta(folder);
  meta.color = trimmed;
  writeAgentMeta(folder, meta);
  return metaToAgent(folder, meta);
}
