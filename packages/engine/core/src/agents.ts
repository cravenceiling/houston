/**
 * Workspace-scoped agent listing + metadata CRUD.
 *
 * Port of `houston-engine-core/src/agents_crud.rs`. Each agent lives at
 * `<root>/<workspace_name>/<agent_name>/` with metadata in
 * `.houston/agent.json`; linked projects are symlinks to a real path. The
 * `folderPath` returned is the canonical (symlink-resolved) path, which the
 * desktop store relies on to repoint its file watcher.
 *
 * `create` seeds CLAUDE.md, `.agents/skills`, and the prompt scaffold via the
 * prompt module (see `createAgent` below); listing and metadata mutations follow.
 */

import {
  cpSync,
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
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { Agent, CreateAgent, CreateAgentResult } from "@houston-ai/engine-protocol";
import { CoreError } from "./error.ts";
import { log } from "./log.ts";
import { readAllWorkspaces } from "./workspaces.ts";
import { seedAgent } from "./sessions/prompt.ts";

export interface AgentMeta {
  id: string;
  name?: string | null;
  config_id: string;
  color?: string | null;
  created_at: string;
  last_opened_at?: string | null;
}

// `Agent` is the canonical wire DTO — re-export the protocol type rather than
// keep a divergent copy. The wire shape omits `color`/`lastOpenedAt` when absent
// (Rust `skip_serializing_if = "Option::is_none"`), so they are optional, never null.
export type { Agent } from "@houston-ai/engine-protocol";

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
  const agent: Agent = {
    id: meta.id,
    name,
    folderPath: realPath,
    configId: meta.config_id,
    createdAt: meta.created_at,
  };
  if (meta.color != null) agent.color = meta.color;
  if (meta.last_opened_at != null) agent.lastOpenedAt = meta.last_opened_at;
  return agent;
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

// ---------------------------------------------------------------------------
// Create — port of `agents_crud.rs::create`
// ---------------------------------------------------------------------------

/** Default agent role file when the caller supplies none (matches Rust). */
const DEFAULT_AGENT_CLAUDE_MD = "## Instructions\n\n## Learnings\n";

function nowIso(): string {
  return new Date().toISOString();
}

/** Expand a leading `~` to the user's home dir (port of `paths::expand_tilde`). */
function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

function tryReadFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }
}

/** Seed paths that must NOT be written from caller `seeds` (activity is seeded empty separately). */
function isActivitySeedPath(path: string): boolean {
  return path === ".houston/activity.json" || path === ".houston/activity/activity.json";
}

function seedJsonIfMissing(houston: string, filename: string, content: string): void {
  const path = join(houston, filename);
  if (!existsSync(path)) writeFileSync(path, content);
}

/**
 * Create an agent in a workspace. Port of `houston-engine-core::agents_crud::create`:
 * scaffold the folder (a real dir, or a symlink to `existingPath` for linked
 * projects), copy packaged skills from `installedPath`, write `agent.json` +
 * CLAUDE.md, apply caller `seeds`, lay down the prompt skeleton via `seedAgent`,
 * and seed empty `activity.json`/`config.json`. Emits no events — matching the
 * Rust side; the client invalidates on mutation success.
 */
export function createAgent(
  root: string,
  workspaceId: string,
  req: CreateAgent,
): CreateAgentResult {
  const wsDir = resolveWsFolder(root, workspaceId);
  const isLinked = req.existingPath !== undefined;

  let folder: string;
  if (req.existingPath !== undefined) {
    const target = expandTilde(req.existingPath);
    if (!existsSync(target)) {
      throw CoreError.badRequest(`Directory does not exist: ${target}`);
    }
    const linkPath = join(wsDir, req.name);
    if (existsSync(linkPath)) {
      throw CoreError.conflict(`An agent named "${req.name}" already exists`);
    }
    symlinkSync(target, linkPath, "dir");
    folder = target;
  } else {
    folder = join(wsDir, req.name);
    if (existsSync(folder)) {
      throw CoreError.conflict(`An agent named "${req.name}" already exists`);
    }
    mkdirSync(folder, { recursive: true });
  }

  mkdirSync(join(folder, ".agents", "skills"), { recursive: true });
  if (req.installedPath !== undefined) {
    const packagedSkills = join(req.installedPath, ".agents", "skills");
    if (existsSync(packagedSkills)) {
      cpSync(packagedSkills, join(folder, ".agents", "skills"), { recursive: true });
    }
  }

  const now = nowIso();
  const meta: AgentMeta = {
    id: randomUUID(),
    name: isLinked ? req.name : null,
    config_id: req.configId,
    color: req.color ?? null,
    created_at: now,
    last_opened_at: now,
  };
  writeAgentMeta(folder, meta);

  const claudeMdPath = join(folder, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) {
    const content =
      req.claudeMd ??
      (req.installedPath !== undefined
        ? tryReadFile(join(req.installedPath, "CLAUDE.md"))
        : undefined) ??
      DEFAULT_AGENT_CLAUDE_MD;
    writeFileSync(claudeMdPath, content);
  }

  if (req.seeds) {
    for (const [path, content] of Object.entries(req.seeds)) {
      if (isActivitySeedPath(path)) continue;
      const target = join(folder, path);
      if (!existsSync(target)) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
      }
    }
  }

  seedAgent(folder);

  const houston = houstonDir(folder);
  seedJsonIfMissing(houston, "activity.json", "[]");
  seedJsonIfMissing(houston, "config.json", "{}");

  return { agent: metaToAgent(folder, meta) };
}
