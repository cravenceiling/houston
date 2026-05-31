/**
 * File-change attribution.
 *
 * Port of `houston-engine-core/src/sessions/file_changes.rs`: snapshot the
 * working directory's user-visible files before a turn, diff after, and report
 * created/modified paths. Seeded agent role files (CLAUDE/AGENTS/GEMINI.md) and
 * machinery directories are excluded so the agent is never reported as having
 * "created" its own instructions.
 */

import { type Dirent, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

export interface FileEntry {
  size: number;
  mtime: number;
}
export type Snapshot = Map<string, FileEntry>;

const SKIP_DIRS = new Set([
  ".git", "node_modules", "__pycache__", ".venv", "venv", ".cache", "target",
  "dist", "build", ".houston", ".agents",
]);
const ROLE_FILES = new Set(["claude.md", "agents.md", "gemini.md"]);

function toRel(root: string, full: string): string {
  const rel = full.startsWith(root + sep) ? full.slice(root.length + 1) : full;
  return sep === "/" ? rel : rel.split(sep).join("/");
}

/** Snapshot user-visible files (path -> size + mtime ms) under `root`. */
export function snapshot(root: string): Snapshot {
  const out: Snapshot = new Map();
  walk(root, root, out);
  return out;
}

function walk(root: string, dir: string, out: Snapshot): void {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const name = ent.name;
    const full = join(dir, name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      walk(root, full, out);
      continue;
    }
    if (ROLE_FILES.has(name.toLowerCase())) continue;
    try {
      const st = statSync(full);
      out.set(toRel(root, full), { size: st.size, mtime: Math.trunc(st.mtimeMs) });
    } catch {
      /* unreadable — skip */
    }
  }
}

export interface FileChangesResult {
  created: string[];
  modified: string[];
}

export function diff(before: Snapshot, after: Snapshot): FileChangesResult {
  const created: string[] = [];
  const modified: string[] = [];
  for (const [path, entry] of after) {
    const prev = before.get(path);
    if (!prev) {
      created.push(path);
    } else if (prev.size !== entry.size || prev.mtime !== entry.mtime) {
      modified.push(path);
    }
  }
  created.sort();
  modified.sort();
  return { created, modified };
}

export function isEmpty(result: FileChangesResult): boolean {
  return result.created.length === 0 && result.modified.length === 0;
}
