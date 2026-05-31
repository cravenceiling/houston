/**
 * Server-push events and feed items.
 *
 * Mirrors:
 *  - `FeedItem` from `engine/houston-terminal-manager/src/types.rs`
 *    (`#[serde(tag = "feed_type", content = "data", rename_all = "snake_case")]`)
 *  - `HoustonEvent` from `engine/houston-ui-events/src/lib.rs`
 *    (`#[serde(tag = "type", content = "data")]`, PascalCase variants)
 *  - `event_topic` / `is_low_severity_feed` from the protocol crate.
 *
 * These shapes are what the existing TS clients already consume, so they must
 * match the Rust serde output exactly.
 */

// ---------------------------------------------------------------------------
// Provider error taxonomy
// ---------------------------------------------------------------------------

/**
 * Typed provider failure (rate-limited, quota-exhausted, auth expired, ...).
 *
 * The Rust enum lives in `houston-terminal-manager/src/provider_error_kind.rs`
 * and is rendered variant-by-variant by `app/src/components/shell/
 * provider-error-card.tsx`. The exact serde discriminants are formalized when
 * the provider/error milestone (M4) lands and the classifier is ported; until
 * then this stays an open `kind`-tagged shape so the happy path compiles
 * without guessing the wire form.
 */
export interface ProviderError {
  kind: string;
  [extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Claude Code installer error (event payload + REST status field)
// ---------------------------------------------------------------------------

export type ClaudeInstallErrorKind =
  | "timeout"
  | "network_unreachable"
  | "download_interrupted"
  | "http_error"
  | "checksum_mismatch"
  | "platform_unsupported"
  | "write_failed"
  | "manifest_missing"
  | "manifest_entry_missing"
  | "unknown";

export interface ClaudeInstallError {
  kind: ClaudeInstallErrorKind;
  status?: number;
  platform?: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// FeedItem — `{ feed_type, data }`
// ---------------------------------------------------------------------------

export interface FileChanges {
  created: string[];
  modified: string[];
}

export type ToolRuntimeErrorKind =
  | "local_tool"
  | "provider_process"
  | "provider_model_unsupported";

/**
 * One rendered item in a session feed. The tuple-style Rust variants
 * (`AssistantText(String)`) serialize with `data` set directly to the inner
 * value; struct variants put an object in `data`.
 */
export type FeedItem =
  | { feed_type: "assistant_text"; data: string }
  | { feed_type: "assistant_text_streaming"; data: string }
  | { feed_type: "thinking"; data: string }
  | { feed_type: "thinking_streaming"; data: string }
  | { feed_type: "user_message"; data: string }
  | { feed_type: "tool_runtime_error"; data: { kind: ToolRuntimeErrorKind; details: string } }
  | { feed_type: "provider_error"; data: ProviderError }
  | { feed_type: "tool_call"; data: { name: string; input: unknown } }
  | { feed_type: "tool_result"; data: { content: string; is_error: boolean } }
  | { feed_type: "system_message"; data: string }
  | {
      feed_type: "final_result";
      data: { result: string; cost_usd: number | null; duration_ms: number | null };
    }
  | { feed_type: "file_changes"; data: FileChanges };

/** Constructors that produce the exact wire shape for each feed item. */
export const Feed = {
  assistantText: (text: string): FeedItem => ({ feed_type: "assistant_text", data: text }),
  assistantTextStreaming: (text: string): FeedItem => ({
    feed_type: "assistant_text_streaming",
    data: text,
  }),
  thinking: (text: string): FeedItem => ({ feed_type: "thinking", data: text }),
  thinkingStreaming: (text: string): FeedItem => ({ feed_type: "thinking_streaming", data: text }),
  userMessage: (text: string): FeedItem => ({ feed_type: "user_message", data: text }),
  toolCall: (name: string, input: unknown): FeedItem => ({
    feed_type: "tool_call",
    data: { name, input },
  }),
  toolResult: (content: string, isError: boolean): FeedItem => ({
    feed_type: "tool_result",
    data: { content, is_error: isError },
  }),
  toolRuntimeError: (kind: ToolRuntimeErrorKind, details: string): FeedItem => ({
    feed_type: "tool_runtime_error",
    data: { kind, details },
  }),
  providerError: (error: ProviderError): FeedItem => ({ feed_type: "provider_error", data: error }),
  systemMessage: (text: string): FeedItem => ({ feed_type: "system_message", data: text }),
  finalResult: (result: string, costUsd?: number | null, durationMs?: number | null): FeedItem => ({
    feed_type: "final_result",
    data: { result, cost_usd: costUsd ?? null, duration_ms: durationMs ?? null },
  }),
  fileChanges: (created: string[], modified: string[]): FeedItem => ({
    feed_type: "file_changes",
    data: { created, modified },
  }),
} as const;

/**
 * Streaming deltas that may be dropped under backpressure (a non-streaming
 * final variant always follows). Mirrors `is_low_severity_feed`.
 */
export function isLowSeverityFeed(item: FeedItem): boolean {
  return item.feed_type === "assistant_text_streaming" || item.feed_type === "thinking_streaming";
}

// ---------------------------------------------------------------------------
// HoustonEvent — `{ type, data }`
// ---------------------------------------------------------------------------

export type HoustonEvent =
  | { type: "FeedItem"; data: { agent_path: string; session_key: string; item: FeedItem } }
  | {
      type: "SessionStatus";
      data: { agent_path: string; session_key: string; status: string; error: string | null };
    }
  | { type: "Toast"; data: { message: string; variant: string } }
  | { type: "AuthRequired"; data: { provider: string; message: string } }
  | { type: "CompletionToast"; data: { title: string; issue_id: string | null } }
  | {
      type: "EventReceived";
      data: {
        event_id: string;
        event_type: string;
        source_channel: string;
        source_identifier: string;
        summary: string;
      };
    }
  | { type: "EventProcessed"; data: { event_id: string; status: string } }
  | { type: "HeartbeatFired"; data: { prompt: string; project_id: string | null } }
  | { type: "CronFired"; data: { job_id: string; job_name: string; prompt: string } }
  | { type: "RoutinesChanged"; data: { agent_path: string } }
  | { type: "RoutineRunsChanged"; data: { agent_path: string } }
  | { type: "ActivityChanged"; data: { agent_path: string } }
  | { type: "SkillsChanged"; data: { agent_path: string } }
  | { type: "FilesChanged"; data: { agent_path: string } }
  | { type: "ConfigChanged"; data: { agent_path: string } }
  | { type: "ContextChanged"; data: { agent_path: string } }
  | { type: "ConversationsChanged"; data: { project_id: string; agent_path: string } }
  | { type: "LearningsChanged"; data: { agent_path: string } }
  | { type: "ComposioCliReady" }
  | { type: "ComposioCliFailed"; data: { message: string } }
  | { type: "ComposioConnectionAdded"; data: { toolkit: string } }
  | { type: "ClaudeCliInstalling"; data: { progress_pct: number } }
  | { type: "ClaudeCliReady" }
  | { type: "ClaudeCliFailed"; data: { error: ClaudeInstallError } }
  | {
      type: "ProviderLoginUrl";
      data: { provider: string; url: string; user_code: string | null };
    }
  | {
      type: "ProviderLoginComplete";
      data: { provider: string; success: boolean; error: string | null };
    };

/** Convenience constructors for the events the runtime emits today. */
export const Event = {
  feedItem: (agentPath: string, sessionKey: string, item: FeedItem): HoustonEvent => ({
    type: "FeedItem",
    data: { agent_path: agentPath, session_key: sessionKey, item },
  }),
  sessionStatus: (
    agentPath: string,
    sessionKey: string,
    status: string,
    error: string | null = null,
  ): HoustonEvent => ({
    type: "SessionStatus",
    data: { agent_path: agentPath, session_key: sessionKey, status, error },
  }),
  filesChanged: (agentPath: string): HoustonEvent => ({
    type: "FilesChanged",
    data: { agent_path: agentPath },
  }),
  activityChanged: (agentPath: string): HoustonEvent => ({
    type: "ActivityChanged",
    data: { agent_path: agentPath },
  }),
  configChanged: (agentPath: string): HoustonEvent => ({
    type: "ConfigChanged",
    data: { agent_path: agentPath },
  }),
  conversationsChanged: (projectId: string, agentPath: string): HoustonEvent => ({
    type: "ConversationsChanged",
    data: { project_id: projectId, agent_path: agentPath },
  }),
  authRequired: (provider: string, message: string): HoustonEvent => ({
    type: "AuthRequired",
    data: { provider, message },
  }),
  toast: (message: string, variant: string): HoustonEvent => ({
    type: "Toast",
    data: { message, variant },
  }),
} as const;

/** The firehose topic — receives every event regardless of routing topic. */
export const FIREHOSE = "*";

/**
 * Map an event to its WS topic. Mirrors `event_topic` in the protocol crate.
 * Clients subscribe to these topics (or `*`) via `ClientRequest`.
 */
export function eventTopic(event: HoustonEvent): string {
  switch (event.type) {
    case "FeedItem":
    case "SessionStatus":
      return `session:${event.data.session_key}`;
    case "AuthRequired":
      return "auth";
    case "Toast":
    case "CompletionToast":
      return "toast";
    case "EventReceived":
    case "EventProcessed":
      return "events";
    case "HeartbeatFired":
    case "CronFired":
      return "scheduler";
    case "RoutinesChanged":
    case "RoutineRunsChanged":
      return `routines:${event.data.agent_path}`;
    case "ActivityChanged":
    case "SkillsChanged":
    case "FilesChanged":
    case "ConfigChanged":
    case "ContextChanged":
    case "LearningsChanged":
    case "ConversationsChanged":
      return `agent:${event.data.agent_path}`;
    case "ComposioCliReady":
    case "ComposioCliFailed":
    case "ComposioConnectionAdded":
      return "composio";
    case "ClaudeCliInstalling":
    case "ClaudeCliReady":
    case "ClaudeCliFailed":
      return "claude";
    case "ProviderLoginUrl":
    case "ProviderLoginComplete":
      return "providers";
  }
}

/** Topic-name helpers mirroring `ui/engine-client/src/ws.ts`. */
export const topics = {
  firehose: FIREHOSE,
  session: (sessionKey: string) => `session:${sessionKey}`,
  agent: (agentPath: string) => `agent:${agentPath}`,
  routines: (agentPath: string) => `routines:${agentPath}`,
  auth: "auth",
  toast: "toast",
  events: "events",
  scheduler: "scheduler",
  composio: "composio",
  claude: "claude",
  providers: "providers",
} as const;
