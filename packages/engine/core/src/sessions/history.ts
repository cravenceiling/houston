/**
 * Load chat history for a conversation slot.
 *
 * Port of `houston-engine-core/src/sessions/history.rs`: resolve every session
 * id recorded for the slot, read their `chat_feed` rows, sort chronologically,
 * and project to `{ feed_type, data }` (the `data_json` re-parsed).
 */

import type { EngineState } from "../engine.ts";
import { resolveAgentDir } from "../paths.ts";
import { sessionIdsForHistory } from "./session-id.ts";

export interface ChatHistoryEntry {
  feed_type: string;
  data: unknown;
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

export function loadHistory(
  engine: EngineState,
  agentPath: string,
  sessionKey: string,
): ChatHistoryEntry[] {
  const agentDir = resolveAgentDir(engine.paths, agentPath);
  const ids = sessionIdsForHistory(agentDir, sessionKey);
  const rows = ids.flatMap((id) => engine.db.listChatFeedBySession(id));
  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return rows.map((r) => ({ feed_type: r.feed_type, data: safeParse(r.data_json) }));
}
