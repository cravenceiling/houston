/**
 * File I/O for an agent's directory.
 *
 * Port of `houston-engine-core/src/agents/files.rs` plus the path-safety layer
 * of `houston-agent-files`. Two layers:
 *  - Agent-data files (`readAgentFile`/`writeAgentFile`) under `.houston/`,
 *    with path-traversal safety; writes return the `HoustonEvent` the caller
 *    should emit so the UI invalidates the right query.
 *  - User-facing project files (`listProjectFiles`/`readProjectFile`/…) for the
 *    file browser, filtered to document extensions with agent role files hidden.
 */

import {
  type Dirent,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { HoustonEvent } from "@houston-ai/engine-protocol";
import { CoreError } from "./error.ts";
import { log } from "./log.ts";

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/** Resolve `rel` under `root`, rejecting absolute paths and `..` escapes. */
export function safeJoin(root: string, rel: string): string {
  if (rel.includes("\0")) throw CoreError.badRequest(`invalid relative path: ${rel}`);
  if (isAbsolute(rel)) throw CoreError.badRequest("path escapes agent root");
  const base = resolve(root);
  const full = resolve(base, rel);
  if (full !== base && !full.startsWith(base + sep)) {
    throw CoreError.badRequest("path escapes agent root");
  }
  return full;
}

// ---------------------------------------------------------------------------
// Agent-data files
// ---------------------------------------------------------------------------

/** Read a file under an agent's directory. Returns "" if it does not exist. */
export function readAgentFile(agentRoot: string, relPath: string): string {
  const full = safeJoin(agentRoot, relPath);
  if (!existsSync(full)) return "";
  return readFileSync(full, "utf-8");
}

/** Atomically write a file under an agent's directory. */
export function writeFileAtomic(agentRoot: string, relPath: string, content: string): void {
  const full = safeJoin(agentRoot, relPath);
  mkdirSync(dirname(full), { recursive: true });
  const tmp = `${full}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, content);
    renameSync(tmp, full);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw e instanceof Error ? CoreError.internal(`failed to write ${relPath}: ${e.message}`) : e;
  }
}

/**
 * Write an agent-data file and return the `HoustonEvent` the caller should
 * emit (or `null` for paths outside the typed `.houston/` layout).
 */
export function writeAgentFile(
  agentRoot: string,
  agentPath: string,
  relPath: string,
  content: string,
): HoustonEvent | null {
  writeFileAtomic(agentRoot, relPath, content);
  return eventForWrite(agentPath, relPath);
}

const KNOWN_TYPES = ["activity", "routines", "routine_runs", "config", "learnings"] as const;

/** Map a `.houston/<type>/...json` (or legacy flat) path to its type slug. */
export function classifyAgentFile(relPath: string): string | null {
  const norm = relPath.replace(/\\/g, "/");
  if (!norm.startsWith(".houston/")) return null;
  const rest = norm.slice(".houston/".length);
  const head = rest.split("/")[0].replace(/\.json$/, "");
  return (KNOWN_TYPES as readonly string[]).includes(head) ? head : null;
}

function eventForWrite(agentPath: string, relPath: string): HoustonEvent | null {
  const norm = relPath.replace(/\\/g, "/");
  if (norm === "CLAUDE.md" || norm.startsWith(".houston/prompts/")) {
    return { type: "ContextChanged", data: { agent_path: agentPath } };
  }
  switch (classifyAgentFile(norm)) {
    case "activity":
      return { type: "ActivityChanged", data: { agent_path: agentPath } };
    case "routines":
      return { type: "RoutinesChanged", data: { agent_path: agentPath } };
    case "routine_runs":
      return { type: "RoutineRunsChanged", data: { agent_path: agentPath } };
    case "config":
      return { type: "ConfigChanged", data: { agent_path: agentPath } };
    case "learnings":
      return { type: "LearningsChanged", data: { agent_path: agentPath } };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Project files (user-facing browser)
// ---------------------------------------------------------------------------

const USER_EXTENSIONS = new Set([
  "docx", "doc", "xlsx", "xls", "pptx", "ppt", "pdf", "png", "jpg", "jpeg",
  "svg", "gif", "txt", "rtf", "csv", "md", "markdown",
]);

const HIDDEN_ROLE_FILES = ["claude.md", "agents.md", "gemini.md"];

const SKIP_DIRS = new Set([
  ".git", "node_modules", "__pycache__", ".venv", "venv", ".env", ".cache",
  "target", "dist", "build", "skills", "scripts",
]);

export interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  date_modified?: number;
}

function isHiddenRoleFile(name: string): boolean {
  return HIDDEN_ROLE_FILES.includes(name.toLowerCase());
}

function shouldSkipDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith(".");
}

function toRel(root: string, full: string): string {
  const rel = full.startsWith(root + sep) ? full.slice(root.length + 1) : full;
  return sep === "/" ? rel : rel.split(sep).join("/");
}

function mtimeMillis(full: string): number | undefined {
  try {
    return Math.trunc(statSync(full).mtimeMs);
  } catch {
    return undefined;
  }
}

/** List user-facing document files in an agent folder (recursive). */
export function listProjectFiles(agentRoot: string): ProjectFile[] {
  const root = resolve(agentRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  const out: ProjectFile[] = [];
  collectFiles(root, root, out);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

function collectFiles(root: string, dir: string, out: ProjectFile[]): void {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      if (shouldSkipDir(ent.name)) continue;
      out.push({
        path: toRel(root, full),
        name: ent.name,
        extension: "",
        size: 0,
        is_directory: true,
        date_modified: mtimeMillis(full),
      });
      collectFiles(root, full, out);
      continue;
    }
    const ext = extname(ent.name).replace(/^\./, "").toLowerCase();
    if (!USER_EXTENSIONS.has(ext)) continue;
    if (isHiddenRoleFile(ent.name)) continue;
    let size = 0;
    try {
      size = statSync(full).size;
    } catch {
      /* leave 0 */
    }
    out.push({
      path: toRel(root, full),
      name: ent.name,
      extension: ext,
      size,
      is_directory: false,
      date_modified: mtimeMillis(full),
    });
  }
}

/** Read an arbitrary text file from the agent by relative path. */
export function readProjectFile(agentRoot: string, relPath: string): string {
  const full = safeJoin(agentRoot, relPath);
  if (!existsSync(full)) throw CoreError.notFound(`file: ${relPath}`);
  return readFileSync(full, "utf-8");
}

export function renameFile(agentRoot: string, relPath: string, newName: string): void {
  const full = safeJoin(agentRoot, relPath);
  if (!existsSync(full)) throw CoreError.notFound(`file: ${relPath}`);
  renameSync(full, join(dirname(full), newName));
}

export function deleteFile(agentRoot: string, relPath: string): void {
  const full = safeJoin(agentRoot, relPath);
  if (!existsSync(full)) throw CoreError.notFound(`file: ${relPath}`);
  rmSync(full, { force: true });
}

export function createFolder(agentRoot: string, relative: string): string {
  const trimmed = relative.trim().replace(/^\/+|\/+$/g, "");
  if (trimmed.length === 0) throw CoreError.badRequest("folder name cannot be empty");
  const full = safeJoin(agentRoot, trimmed);
  mkdirSync(full, { recursive: true });
  return trimmed;
}
