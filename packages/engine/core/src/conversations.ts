/**
 * Conversation listing — a derived view over `.houston/activity/activity.json`.
 *
 * Port of `houston-engine-core/src/conversations.rs`. A conversation is
 * addressed by its activity's stored `session_key`: normal missions use
 * `activity-{id}`, routine chats use a stable `routine-{routine_id}` shared by
 * every run (so a routine's runs collapse into one conversation). We surface the
 * stored key verbatim, falling back to `activity-{id}` only for legacy rows
 * written before the field existed — otherwise Mission Control would address the
 * wrong conversation and a routine's history would load empty (#381). Reuses
 * `listActivities` (which self-heals trailing-garbage corruption) rather than
 * re-reading the file.
 */

import { basename } from "node:path";
import type { Activity, ConversationEntry } from "@houston-ai/engine-protocol";
import { listActivities } from "./agent-store.ts";
import { log } from "./log.ts";

function toEntry(root: string, agentName: string, a: Activity): ConversationEntry {
  return {
    id: a.id,
    title: a.title ?? "",
    // Empty description serializes as absent, matching the Rust
    // `Some(desc).filter(non-empty)` (skip_serializing_if = Option::is_none).
    description: a.description && a.description.length > 0 ? a.description : undefined,
    status: a.status ?? "",
    type: "activity",
    session_key:
      a.session_key && a.session_key.length > 0 ? a.session_key : `activity-${a.id}`,
    updated_at: a.updated_at,
    agent_path: root,
    agent_name: agentName,
    agent: a.agent,
    routine_id: a.routine_id,
    worktree_path: a.worktree_path ?? undefined,
  };
}

/** Lexicographic most-recent-first sort, mirroring the Rust `b_t.cmp(a_t)`. */
function byUpdatedDesc(a: ConversationEntry, b: ConversationEntry): number {
  const at = a.updated_at ?? "";
  const bt = b.updated_at ?? "";
  return bt < at ? -1 : bt > at ? 1 : 0;
}

/** List every conversation in a single agent, most-recently-updated first. */
export function listConversations(root: string): ConversationEntry[] {
  const agentName = basename(root);
  const entries = listActivities(root).map((a) => toEntry(root, agentName, a));
  entries.sort(byUpdatedDesc);
  return entries;
}

/**
 * Aggregate conversations across many agents, most-recent first. Errors on
 * individual agents are logged and skipped — one bad agent does not poison the
 * aggregate view (mirrors the Rust `list_all`).
 */
export function listAllConversations(roots: string[]): ConversationEntry[] {
  const all: ConversationEntry[] = [];
  for (const root of roots) {
    try {
      all.push(...listConversations(root));
    } catch (e) {
      log.warn(`[conversations] skipping ${root}: ${e}`);
    }
  }
  all.sort(byUpdatedDesc);
  return all;
}
