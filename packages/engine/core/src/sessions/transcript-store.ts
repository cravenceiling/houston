/**
 * Per-conversation transcript persistence — the TS engine's conversation memory.
 *
 * The Rust engine delegates cross-turn continuity to the provider CLI
 * (`claude --resume <session_id>`): the CLI owns the transcript and Houston only
 * persists the resume id. Running the loop IN-PROCESS via pi means there is no
 * external session store to resume from, so Houston must own the transcript
 * itself. After each turn we save pi's native `AgentMessage[]`
 * (`agent.state.messages`) for the slot; the next turn seeds the new `Agent`
 * with it via `initialState.messages`, restoring full context.
 *
 * We persist pi's native messages — NOT the `chat_feed` rows — because chat_feed
 * is a lossy display projection (assistant text split per block, tool calls
 * flattened to text summaries, the toolCall↔toolResult id linkage dropped,
 * thinking signatures discarded). Re-feeding that into the model would corrupt
 * provider context. The native `AgentMessage` is exactly what the loop consumes,
 * so round-tripping it through JSON is lossless.
 *
 * Stored as a file sibling to the slot's `.sid` (see `session-id.ts`), keyed by
 * the same (provider, sessionKey) pair — a provider switch starts a fresh
 * transcript. Keeping it out of the DB preserves the `chat_feed` schema's
 * byte-for-byte compatibility with the Rust engine and keeps serialized tool
 * JSON out of the FTS index. This is TS-engine-private state, exactly like `.sid`.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

function transcriptPath(agentDir: string, provider: string, sessionKey: string): string {
  return join(agentDir, ".houston", "sessions", provider, `${sessionKey}.messages.json`);
}

/** Load the saved transcript for a slot, or `[]` for a fresh / unreadable slot. */
export function loadTranscript(
  agentDir: string,
  provider: string,
  sessionKey: string,
): AgentMessage[] {
  const path = transcriptPath(agentDir, provider, sessionKey);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  if (raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgentMessage[]) : [];
  } catch {
    // A corrupt transcript must not wedge the conversation; start fresh.
    return [];
  }
}

/** Persist the full transcript for a slot (overwrites the whole slot). */
export function saveTranscript(
  agentDir: string,
  provider: string,
  sessionKey: string,
  messages: AgentMessage[],
): void {
  const path = transcriptPath(agentDir, provider, sessionKey);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(messages));
}

/** Drop a slot's transcript (mirrors `clearChatFeedBySession` for "new conversation"). */
export function clearTranscript(agentDir: string, provider: string, sessionKey: string): void {
  const path = transcriptPath(agentDir, provider, sessionKey);
  rmSync(path, { force: true });
}
