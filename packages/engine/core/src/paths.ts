/**
 * Filesystem path resolution.
 *
 * Port of `engine/houston-engine-core/src/paths.rs`. Workspaces live under
 * `<docs>` (`<home>/workspaces`); installed agent definitions under
 * `<home>/agents`. Agent paths on the wire are typically the agent's absolute
 * `folderPath`, but tilde and workspaces-relative forms are also accepted.
 */

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** Expand a leading `~` to the user's home directory. */
export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

export class EnginePaths {
  constructor(
    readonly docsDir: string,
    readonly homeDir: string,
  ) {}

  /** Workspaces root (`<home>/workspaces`). */
  workspacesRoot(): string {
    return this.docsDir;
  }

  /** Installed-agent definitions (`<home>/agents`). */
  agentsDir(): string {
    return join(this.homeDir, "agents");
  }

  /** Sidecar discovery manifest (`<home>/engine.json`). */
  engineJsonPath(): string {
    return join(this.homeDir, "engine.json");
  }

  /** SQLite database file (`<home>/houston.db`). */
  dbPath(): string {
    return join(this.homeDir, "houston.db");
  }
}

/**
 * Resolve an agent-path argument to an absolute directory. Accepts an absolute
 * path, a `~`-prefixed path, or a path relative to the workspaces root.
 */
export function resolveAgentDir(paths: EnginePaths, agentPath: string): string {
  const expanded = expandTilde(agentPath);
  if (isAbsolute(expanded)) return resolve(expanded);
  return resolve(join(paths.docsDir, expanded));
}
