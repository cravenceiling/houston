/**
 * Agent filesystem watcher.
 *
 * Port of `houston-file-watcher/src/lib.rs` + `routes/watcher.rs`. Watches an
 * agent directory recursively and emits `HoustonEvent`s when files change —
 * the piece that catches writes made directly by the CLI agent (bypassing the
 * HTTP API), which is the core of Houston's AI-native reactivity model.
 *
 * Like the Rust side, the engine holds a SINGLE active watcher: starting a new
 * one stops the previous (switching agents). Changes are debounced 500ms and
 * de-duplicated by event type within each debounce window, so a burst of writes
 * under `.houston/activity/` collapses to one `ActivityChanged`.
 *
 * Uses `node:fs.watch({ recursive: true })` (supported by Bun on macOS +
 * Windows, the desktop targets). No external dependency, matching the Rust
 * engine's zero-dep-beyond-notify footprint.
 */

import { watch, type FSWatcher } from "node:fs";
import { relative as pathRelative, sep } from "node:path";
import type { HoustonEvent } from "@houston-ai/engine-protocol";
import type { EventBus } from "./events.ts";
import { log } from "./log.ts";

const DEBOUNCE_MS = 500;

/**
 * Map a changed file (relative to the agent root) to its event. Direct port of
 * `classify_change`. `rel` uses forward slashes regardless of platform.
 */
export function classifyChange(agentPath: string, rel: string): HoustonEvent | null {
  // .agents/skills (skill convention) and .claude/skills (Claude Code mirror —
  // agents delete skills here, so it must emit SkillsChanged too).
  if (rel.startsWith(".agents/skills") || rel.startsWith(".claude/skills")) {
    return { type: "SkillsChanged", data: { agent_path: agentPath } };
  }

  if (rel.startsWith(".houston/")) {
    const inner = rel.slice(".houston/".length);
    if (inner.startsWith("skills")) {
      return { type: "SkillsChanged", data: { agent_path: agentPath } };
    }
    if (inner.startsWith("prompts")) {
      return { type: "ContextChanged", data: { agent_path: agentPath } };
    }
    // Schema files are never user-data changes.
    if (inner.endsWith(".schema.json")) return null;

    const first = inner.split("/")[0] ?? "";
    switch (first) {
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

  if (rel === "CLAUDE.md") {
    return { type: "ContextChanged", data: { agent_path: agentPath } };
  }

  // Any other user document.
  return { type: "FilesChanged", data: { agent_path: agentPath } };
}

/** Stable key to dedup events within a debounce window (event type + agent). */
function eventKey(event: HoustonEvent): string {
  const data = (event as { data?: { agent_path?: string } }).data;
  return `${event.type}:${data?.agent_path ?? ""}`;
}

/**
 * Holds the single active agent watcher. `start` replaces any prior watcher;
 * `stop` tears it down. Mirrors the Rust `WatcherState(Option<AgentWatcher>)`.
 */
export class AgentWatcher {
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Map<string, HoustonEvent>();

  constructor(private readonly events: EventBus) {}

  /** Start watching `agentPath` recursively, stopping any prior watcher. */
  start(agentPath: string): void {
    this.stop();
    let w: FSWatcher;
    try {
      w = watch(agentPath, { recursive: true, persistent: false }, (_kind, filename) => {
        if (filename == null) return; // some platforms omit the name on overflow
        this.onChange(agentPath, filename.toString());
      });
    } catch (e) {
      throw new Error(
        `Failed to start watching ${agentPath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    w.on("error", (err) => log.error(`[watcher] error: ${err}`));
    this.watcher = w;
    log.info(`[watcher] Watching: ${agentPath}`);
  }

  /** Stop the active watcher and drop any pending debounced events. */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private onChange(agentPath: string, changed: string): void {
    // `changed` is relative to the watched root already on most platforms, but
    // normalize defensively (absolute on some) and to forward slashes.
    let rel = changed;
    if (rel.startsWith(agentPath)) rel = pathRelative(agentPath, rel);
    if (sep !== "/") rel = rel.split(sep).join("/");

    const event = classifyChange(agentPath, rel);
    if (!event) return;
    this.pending.set(eventKey(event), event);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
    }
  }

  private flush(): void {
    this.timer = null;
    const batch = [...this.pending.values()];
    this.pending.clear();
    for (const event of batch) {
      log.debug(`[watcher] emit: ${event.type}`);
      this.events.emit(event);
    }
  }
}
