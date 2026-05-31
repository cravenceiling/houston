/**
 * Stable per-conversation session id.
 *
 * The Rust engine keys chat history by the provider-issued resume id
 * (`claude_session_id`), persisted per (agent, provider, sessionKey) in
 * `.houston/sessions/<provider>/<sessionKey>.sid`. Running the loop in-process
 * means there is no provider-issued id, so the TS engine mints its own stable
 * id the first time a slot runs and reuses it on follow-up turns, keeping
 * chat-feed rows for one conversation grouped under one key. History reads
 * sweep every provider, mirroring `session_ids_for_history`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

function sidPath(agentDir: string, provider: string, sessionKey: string): string {
  return join(agentDir, ".houston", "sessions", provider, `${sessionKey}.sid`);
}

/** Resolve (creating + persisting if absent) the session id for a slot. */
export function resolveSessionId(agentDir: string, provider: string, sessionKey: string): string {
  const path = sidPath(agentDir, provider, sessionKey);
  if (existsSync(path)) {
    const existing = readFileSync(path, "utf-8").trim();
    if (existing) return existing;
  }
  const sid = randomUUID();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, sid);
  return sid;
}

/** Every session id recorded for a slot across all providers (for history). */
export function sessionIdsForHistory(agentDir: string, sessionKey: string): string[] {
  const base = join(agentDir, ".houston", "sessions");
  if (!existsSync(base)) return [];
  const ids: string[] = [];
  for (const provider of readdirSync(base)) {
    const path = join(base, provider, `${sessionKey}.sid`);
    if (!existsSync(path)) continue;
    const sid = readFileSync(path, "utf-8").trim();
    if (sid) ids.push(sid);
  }
  return ids;
}
