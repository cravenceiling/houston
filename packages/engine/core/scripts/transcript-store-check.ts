/**
 * Unit checks for the transcript store's defensive paths (the happy-path
 * round-trip is covered e2e by `chat-continuity.ts`): a missing slot reads `[]`,
 * a corrupt/non-array file reads `[]` (never wedges the conversation), save is a
 * lossless JSON round-trip, and clear removes the slot.
 * Run: `bun scripts/transcript-store-check.ts`.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearTranscript, loadTranscript, saveTranscript } from "../src/sessions/transcript-store.ts";

const dir = mkdtempSync(join(tmpdir(), "ts-transcript-"));
const fails: string[] = [];
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "OK  " : "MISS"} ${label}`);
  if (!cond) fails.push(label);
};

// Missing slot → [].
check(loadTranscript(dir, "anthropic", "k1").length === 0, "missing slot -> []");

// Round-trip (cast through unknown — the store is shape-agnostic about pi's AgentMessage).
const messages = [
  { role: "user", content: [{ type: "text", text: "hi" }] },
  { role: "assistant", content: [{ type: "text", text: "hello" }] },
] as unknown as Parameters<typeof saveTranscript>[3];
saveTranscript(dir, "anthropic", "k1", messages);
const loaded = loadTranscript(dir, "anthropic", "k1");
check(loaded.length === 2 && JSON.stringify(loaded) === JSON.stringify(messages), "save/load round-trip lossless");

// Slots are isolated by (provider, sessionKey).
check(loadTranscript(dir, "anthropic", "k2").length === 0, "different sessionKey is a separate slot");
check(loadTranscript(dir, "openai-codex", "k1").length === 0, "different provider is a separate slot");

// Corrupt + non-array files → [] (must not throw / wedge).
const base = join(dir, ".houston", "sessions", "anthropic");
mkdirSync(base, { recursive: true });
writeFileSync(join(base, "corrupt.messages.json"), "{ not json");
check(loadTranscript(dir, "anthropic", "corrupt").length === 0, "corrupt file -> []");
writeFileSync(join(base, "object.messages.json"), '{"role":"user"}');
check(loadTranscript(dir, "anthropic", "object").length === 0, "non-array file -> []");

// Clear removes the slot.
clearTranscript(dir, "anthropic", "k1");
check(loadTranscript(dir, "anthropic", "k1").length === 0, "clear removes the slot");

console.log(`\n${fails.length === 0 ? "TRANSCRIPT_OK" : "TRANSCRIPT_FAILED"}`);
process.exit(fails.length === 0 ? 0 : 1);
