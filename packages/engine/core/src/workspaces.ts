/**
 * Workspace CRUD + self-healing index I/O.
 *
 * Port of `houston-engine-core/src/workspaces/{mod,io}.rs`. A workspace is a
 * directory `<root>/<name>/` plus an entry in `<root>/workspaces.json`. The
 * reader recovers `workspaces.json` files corrupted by the historical
 * concurrent-writer race (valid JSON array + trailing garbage); writes are
 * atomic via a per-call temp file + rename.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { CoreError } from "./error.ts";
import { log } from "./log.ts";

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  provider?: string;
  model?: string;
}

function jsonPath(root: string): string {
  return join(root, "workspaces.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Read all workspaces, recovering from trailing-garbage corruption. */
export function readAllWorkspaces(root: string): Workspace[] {
  const path = jsonPath(root);
  if (!existsSync(path)) return [];
  const contents = readFileSync(path, "utf-8");
  try {
    return JSON.parse(contents) as Workspace[];
  } catch (err) {
    return recoverTrailingGarbage(root, path, contents, err);
  }
}

function writeAll(root: string, workspaces: Workspace[]): void {
  mkdirSync(root, { recursive: true });
  const target = jsonPath(root);
  const tmp = join(root, `workspaces.json.${randomUUID()}.tmp`);
  const json = JSON.stringify(workspaces, null, 2);
  try {
    writeFileSync(tmp, json);
    renameSync(tmp, target);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw e;
  }
}

function recoverTrailingGarbage(
  root: string,
  path: string,
  contents: string,
  original: unknown,
): Workspace[] {
  // Try every `]` from the end: the longest valid `[...]` prefix wins.
  for (let i = contents.length - 1; i >= 0; i--) {
    if (contents[i] !== "]") continue;
    const prefix = contents.slice(0, i + 1);
    try {
      const parsed = JSON.parse(prefix) as Workspace[];
      if (!Array.isArray(parsed)) continue;
      const dropped = contents.length - (i + 1);
      try {
        writeAll(root, parsed);
        log.warn(
          `[workspaces] repaired corrupt ${path} — recovered ${parsed.length} entries, dropped ${dropped} trailing bytes`,
        );
      } catch (e) {
        log.warn(`[workspaces] recovered ${parsed.length} from corrupt ${path} but failed to re-save: ${e}`);
      }
      return parsed;
    } catch {
      /* keep scanning earlier brackets */
    }
  }
  throw original instanceof Error ? original : new Error(String(original));
}

export function listWorkspaces(root: string): Workspace[] {
  mkdirSync(root, { recursive: true });
  return readAllWorkspaces(root);
}

export function createWorkspace(root: string, name: string): Workspace {
  const workspaces = readAllWorkspaces(root);
  if (workspaces.some((w) => w.name === name)) {
    throw CoreError.conflict(`workspace named ${JSON.stringify(name)} already exists`);
  }
  const ws: Workspace = { id: randomUUID(), name, isDefault: false, createdAt: nowIso() };
  const wsDir = join(root, name);
  mkdirSync(join(wsDir, ".houston"), { recursive: true });
  const connections = join(wsDir, ".houston", "connections.json");
  if (!existsSync(connections)) writeFileSync(connections, "[]");
  workspaces.push(ws);
  writeAll(root, workspaces);
  return ws;
}

export function renameWorkspace(root: string, id: string, newName: string): Workspace {
  const workspaces = readAllWorkspaces(root);
  if (workspaces.some((w) => w.name === newName && w.id !== id)) {
    throw CoreError.conflict(`workspace named ${JSON.stringify(newName)} already exists`);
  }
  const ws = workspaces.find((w) => w.id === id);
  if (!ws) throw CoreError.notFound(`workspace ${id}`);
  const oldDir = join(root, ws.name);
  const newDir = join(root, newName);
  if (existsSync(newDir) && oldDir !== newDir) {
    throw CoreError.conflict(`directory named ${JSON.stringify(newName)} already exists`);
  }
  if (existsSync(oldDir) && oldDir !== newDir) renameSync(oldDir, newDir);
  ws.name = newName;
  writeAll(root, workspaces);
  return ws;
}

export function deleteWorkspace(root: string, id: string): void {
  const workspaces = readAllWorkspaces(root);
  const ws = workspaces.find((w) => w.id === id);
  if (!ws) throw CoreError.notFound(`workspace ${id}`);
  if (ws.isDefault) throw CoreError.badRequest("cannot delete the default workspace");
  const wsDir = join(root, ws.name);
  writeAll(root, workspaces.filter((w) => w.id !== id));
  if (existsSync(wsDir)) rmSync(wsDir, { recursive: true, force: true });
}
