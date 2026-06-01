/**
 * Activity summarizer — port of `houston-engine-core::sessions::{summarize,
 * summary_text}`.
 *
 * Generates a concise `{ title, description }` for a new conversation. The Rust
 * engine shelled out to a provider CLI oneshot; here we run a short in-process
 * pi turn with the agent's provider/model. Either way the contract is the same:
 * model failures degrade to a deterministic LOCAL title so conversation
 * creation never depends on title generation.
 */

import { Agent } from "@earendil-works/pi-agent-core";
import type { EngineState } from "../engine.ts";
import { log } from "../log.ts";

export interface SummarizeResult {
  title: string;
  description: string;
}

export interface SummarizeParams {
  message: string;
  agentPath?: string;
  provider?: string;
  model?: string;
}

const TITLE_MAX_CHARS = 40;
const DESCRIPTION_MAX_CHARS = 120;
const SUMMARY_TIMEOUT_MS = 30_000;

// Per-provider default title model (cheap/fast tiers). Mirrors the Rust consts.
const TITLE_MODEL: Record<string, string> = {
  anthropic: "haiku",
  openai: "gpt-5.5-mini",
  "openai-codex": "gpt-5.5-mini",
  gemini: "gemini-3.1-flash-lite",
};

// ── Deterministic text helpers (port of summary_text.rs) ─────────────────────

function normalizeSpaces(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(" ");
}

function truncateChars(value: string, maxChars: number): string {
  return [...value].slice(0, maxChars).join("");
}

function truncateOnWordBoundary(value: string, maxChars: number): string {
  if ([...value].length <= maxChars) return value;
  let cut = truncateChars(value, maxChars);
  const idx = cut.lastIndexOf(" ");
  if (idx !== -1) cut = cut.slice(0, idx);
  return `${cut.replace(/\s+$/, "")}...`;
}

function fallbackTitle(message: string): string {
  if (message.length === 0) return "New mission";
  return truncateOnWordBoundary(message, TITLE_MAX_CHARS);
}

export function fallbackSummary(message: string): SummarizeResult {
  const normalized = normalizeSpaces(message);
  const title = fallbackTitle(normalized);
  const description =
    normalized.length === 0 ? title : truncateChars(normalized, DESCRIPTION_MAX_CHARS);
  return { title, description };
}

function jsonObject(raw: string): string | null {
  const trimmed = raw
    .trim()
    .replace(/^```json/, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || start > end) return null;
  return trimmed.slice(start, end + 1);
}

function cleanTitle(raw: string): string | null {
  const normalized = normalizeSpaces(raw)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.:;]+$/g, "")
    .trim();
  if (normalized.length === 0) return null;
  const words = normalized.split(/\s+/).slice(0, 6).join(" ");
  return truncateChars(words, 64);
}

export function parseSummary(raw: string, fallback: SummarizeResult): SummarizeResult {
  const json = jsonObject(raw);
  if (!json) return fallback;
  let parsed: { title?: unknown; description?: unknown };
  try {
    parsed = JSON.parse(json);
  } catch {
    return fallback;
  }
  const title =
    (typeof parsed.title === "string" ? cleanTitle(parsed.title) : null) ?? fallback.title;
  const descRaw =
    typeof parsed.description === "string"
      ? truncateChars(normalizeSpaces(parsed.description), DESCRIPTION_MAX_CHARS)
      : "";
  const description = descRaw.length > 0 ? descRaw : fallback.description;
  return { title, description };
}

// ── Title prompt + in-process one-shot ───────────────────────────────────────

function titlePrompt(message: string): string {
  return (
    "Generate a concise title and description for this conversation.\n" +
    "Title: max 6 words. Description: one short sentence.\n" +
    "Return ONLY valid JSON, no markdown fences:\n" +
    '{"title": "...", "description": "..."}\n\n' +
    `Task: ${message}`
  );
}

function lastAssistantText(agent: Agent): string {
  const messages = agent.state.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && !m.errorMessage) {
      return m.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");
    }
  }
  return "";
}

/**
 * Summarize a first message into `{ title, description }`. Runs a short pi turn
 * with the agent's provider + a cheap title model; any failure (no model wired,
 * timeout, bad JSON) degrades to the deterministic local fallback.
 */
export async function summarize(
  engine: EngineState,
  params: SummarizeParams,
): Promise<SummarizeResult> {
  const fallback = fallbackSummary(params.message);
  const providerId = params.provider ?? "anthropic";
  const modelAlias = params.model ?? TITLE_MODEL[providerId];
  if (!modelAlias) return fallback; // no title model wired → local title

  let resolved;
  try {
    resolved = engine.modelResolver(providerId, modelAlias);
  } catch (e) {
    log.warn(`[summarize] model resolve failed, using fallback: ${e instanceof Error ? e.message : e}`);
    return fallback;
  }

  try {
    const agent = new Agent({
      initialState: {
        systemPrompt: "You generate concise conversation titles. Output only JSON.",
        model: resolved.model,
        thinkingLevel: "off",
        tools: [],
      },
      getApiKey: (provider: string) => engine.auth.oauthApiKeyFor(provider),
      ...(resolved.streamFn ? { streamFn: resolved.streamFn } : {}),
    });

    const raw = await withTimeout(
      agent.prompt(titlePrompt(params.message)).then(() => lastAssistantText(agent)),
      SUMMARY_TIMEOUT_MS,
      () => agent.abort(),
    );
    if (agent.state.errorMessage) {
      log.warn(`[summarize] model error, using fallback: ${agent.state.errorMessage}`);
      return fallback;
    }
    return parseSummary(raw, fallback);
  } catch (e) {
    log.warn(`[summarize] turn failed, using fallback: ${e instanceof Error ? e.message : e}`);
    return fallback;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`summary timed out after ${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
