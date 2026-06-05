/**
 * Chat-turn orchestration.
 *
 * Port of the transport-neutral orchestration in
 * `houston-engine-core/src/sessions/mod.rs::run_start`, with the provider-CLI
 * subprocess replaced by an in-process pi `Agent`:
 *   register generation -> acquire per-slot turn lock -> staleness check ->
 *   seed -> resolve provider/model + assemble system prompt from disk ->
 *   snapshot files -> flip board activity to running -> echo+persist the user
 *   message -> run the pi Agent (events map to FeedItems via the feed sink) ->
 *   diff files -> emit FinalResult -> terminal status + board flip.
 * Bespoke Houston concerns (queue, staleness, snapshot/diff, board state
 * machine, session-id persistence, chat_feed) stay here; pi owns the loop.
 */

import { mkdirSync } from "node:fs";
import { Agent } from "@earendil-works/pi-agent-core";
import { Event as Ev, Feed } from "@houston-ai/engine-protocol";
import type { EngineState } from "../engine.ts";
import { resolveAgentDir, expandTilde } from "../paths.ts";
import { readConfig, setActivityStatusBySessionKey } from "../agent-store.ts";
import { log } from "../log.ts";
import { assembleSessionPrompt, buildAgentContext, seedAgent } from "./prompt.ts";
import { resolveSessionId } from "./session-id.ts";
import { loadTranscript, saveTranscript } from "./transcript-store.ts";
import { createTools } from "./tools.ts";
import { createFeedSink } from "./feed-mapping.ts";
import { diff, isEmpty, snapshot } from "./file-changes.ts";

export interface StartTurnParams {
  agentPath: string;
  sessionKey: string;
  prompt: string;
  systemPrompt?: string;
  source?: string;
  workingDir?: string;
  provider?: string;
  model?: string;
  effort?: string;
  /** Onboarding turns append the product onboarding prompt. */
  onboarding?: boolean;
}

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

function effortToThinking(effort: string | undefined): ThinkingLevel {
  switch (effort) {
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "max":
    case "xhigh":
      return "xhigh";
    default:
      return "off";
  }
}

/** Start a turn. Returns immediately; the turn runs in the background. */
export function startTurn(engine: EngineState, params: StartTurnParams): void {
  void runTurn(engine, params).catch((err) => {
    log.error("[sessions] turn crashed:", err);
    engine.events.emit(
      Ev.sessionStatus(
        params.agentPath,
        params.sessionKey,
        "error",
        err instanceof Error ? err.message : String(err),
      ),
    );
  });
}

async function runTurn(engine: EngineState, params: StartTurnParams): Promise<void> {
  const { agentPath, sessionKey } = params;
  const agentDir = resolveAgentDir(engine.paths, agentPath);

  const generation = engine.control.register(agentPath, sessionKey);
  const release = await engine.control.acquireTurn(agentPath, sessionKey);
  try {
    // A cancel arrived while this turn was queued — skip it.
    if (engine.control.isStale(agentPath, sessionKey, generation)) {
      if (setActivityStatusBySessionKey(agentDir, sessionKey, "needs_you")) {
        engine.events.emit(Ev.activityChanged(agentPath));
      }
      return;
    }

    mkdirSync(agentDir, { recursive: true });
    seedAgent(agentDir);

    const workingDir = params.workingDir ? expandTilde(params.workingDir) : agentDir;
    const cfg = readConfig(agentDir);
    const providerId = params.provider ?? cfg.provider ?? "anthropic";
    const modelAlias = params.model ?? cfg.model;
    const effort = params.effort ?? cfg.effort;
    const source = params.source ?? "desktop";

    let productPrompt =
      params.systemPrompt && params.systemPrompt.length > 0
        ? params.systemPrompt
        : engine.config.appSystemPrompt;
    if (params.onboarding && engine.config.appOnboardingPrompt) {
      productPrompt = `${productPrompt}\n\n---\n\n${engine.config.appOnboardingPrompt}`;
    }
    const agentContext = buildAgentContext(agentDir, workingDir, undefined);
    const systemPrompt = assembleSessionPrompt(productPrompt, agentContext);

    const before = snapshot(workingDir);
    const sessionId = resolveSessionId(agentDir, providerId, sessionKey);

    if (setActivityStatusBySessionKey(agentDir, sessionKey, "running")) {
      engine.events.emit(Ev.activityChanged(agentPath));
    }

    // Resolve the model (provider failures surface as a card + error status).
    let resolved;
    try {
      resolved = engine.modelResolver(providerId, modelAlias);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      engine.events.emit(
        Ev.feedItem(agentPath, sessionKey, Feed.providerError({ kind: "unknown", message })),
      );
      engine.events.emit(Ev.sessionStatus(agentPath, sessionKey, "error", message));
      if (setActivityStatusBySessionKey(agentDir, sessionKey, "error")) {
        engine.events.emit(Ev.activityChanged(agentPath));
      }
      return;
    }

    const sink = createFeedSink({
      events: engine.events,
      db: engine.db,
      agentPath,
      sessionKey,
      sessionId,
      source,
      userMessage: params.prompt,
    });

    // The user-message echo is emitted lazily by the sink on the first model
    // event (see `feed-mapping.ts`): emitting it eagerly here would beat the
    // frontend's optimistic push and duplicate the message.
    engine.events.emit(Ev.sessionStatus(agentPath, sessionKey, "starting"));

    // Conversation memory: seed the agent with the prior transcript for this
    // slot. The in-process loop has no provider-side session to resume, so the
    // transcript IS the memory (saved at the end of the turn, below).
    const priorMessages = loadTranscript(agentDir, providerId, sessionKey);

    const agent = new Agent({
      initialState: {
        systemPrompt,
        model: resolved.model,
        thinkingLevel: effortToThinking(effort),
        tools: createTools(workingDir),
        messages: priorMessages,
      },
      sessionId,
      // Supply the provider's OAuth access token (auto-refreshed) so a
      // subscription-logged-in account drives the turn; undefined falls back to
      // an env API key.
      getApiKey: (provider: string) => engine.auth.oauthApiKeyFor(provider),
      ...(resolved.streamFn ? { streamFn: resolved.streamFn } : {}),
    });
    agent.subscribe((event) => sink.onEvent(event));

    engine.control.setActive(agentPath, sessionKey, { abort: () => agent.abort() });
    engine.events.emit(Ev.sessionStatus(agentPath, sessionKey, "running"));

    const startedAt = Date.now();
    try {
      await agent.prompt(params.prompt);
    } finally {
      engine.control.clearActive(agentPath, sessionKey);
      // Backstop: a turn that failed before any model event still records the
      // prompt (idempotent — the sink already emitted it on the first event).
      sink.ensureUserMessage();
    }

    const errorMessage = agent.state.errorMessage;
    const durationMs = Date.now() - startedAt;

    // Persist the transcript for the next turn's memory — only on a clean turn,
    // so a cancelled / errored turn never leaves a dangling assistant tool_call
    // (with no matching tool_result) that would break the next turn's model call.
    if (!errorMessage) {
      saveTranscript(agentDir, providerId, sessionKey, agent.state.messages);
    }

    if (!errorMessage) {
      const changes = diff(before, snapshot(workingDir));
      if (!isEmpty(changes)) {
        sink.emit(Feed.fileChanges(changes.created, changes.modified));
        engine.events.emit(Ev.filesChanged(agentPath));
      }
    }

    sink.emit(Feed.finalResult(lastAssistantText(agent), null, durationMs));

    if (errorMessage) {
      engine.events.emit(Ev.sessionStatus(agentPath, sessionKey, "error", errorMessage));
      if (setActivityStatusBySessionKey(agentDir, sessionKey, "error")) {
        engine.events.emit(Ev.activityChanged(agentPath));
      }
    } else {
      engine.events.emit(Ev.sessionStatus(agentPath, sessionKey, "completed"));
      if (setActivityStatusBySessionKey(agentDir, sessionKey, "needs_you")) {
        engine.events.emit(Ev.activityChanged(agentPath));
      }
    }
  } finally {
    release();
  }
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
 * Cancel a turn: abort the active run (or invalidate a queued one) and emit the
 * stopped-by-user system message + completed status, mirroring `cancel()`.
 */
export function cancelTurn(engine: EngineState, agentPath: string, sessionKey: string): boolean {
  const aborted = engine.control.cancel(agentPath, sessionKey);
  engine.events.emit(Ev.feedItem(agentPath, sessionKey, Feed.systemMessage("Stopped by user")));
  engine.events.emit(Ev.sessionStatus(agentPath, sessionKey, "completed"));
  return aborted;
}
