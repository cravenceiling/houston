/**
 * Map pi `AgentEvent`s to Houston `FeedItem`s, emit on the bus, and persist.
 *
 * This is the load-bearing contract (the #1 reimplementation risk). Streaming
 * deltas accumulate into a buffer and are emitted as cumulative
 * `assistant_text_streaming` / `thinking_streaming` items — REPLACE semantics,
 * NOT append: each event carries the whole buffer-so-far so the UI replaces the
 * trailing streaming item. When the assistant message finalizes, the content
 * blocks are emitted as final `assistant_text` / `thinking` / `tool_call` items
 * (which supersede the trailing streaming item). Streaming variants are emitted
 * to the WS but NEVER persisted; every other item is persisted to `chat_feed`
 * keyed by the session id.
 */

import type { AgentEvent } from "@earendil-works/pi-agent-core";
import {
  Event as Ev,
  Feed,
  type FeedItem,
  type ProviderError,
} from "@houston-ai/engine-protocol";
import type { EventBus } from "../events.ts";
import type { Db } from "../db.ts";
import { log } from "../log.ts";

export interface FeedSinkOptions {
  events: EventBus;
  db: Db;
  agentPath: string;
  sessionKey: string;
  sessionId: string;
  source: string;
}

export interface FeedSink {
  /** Pass to `agent.subscribe`. */
  onEvent(event: AgentEvent): void;
  /** Emit (and persist non-streaming) an item directly — used by the runtime. */
  emit(item: FeedItem): void;
}

function extractText(result: { content?: Array<{ type: string; text?: string }> } | undefined): string {
  if (!result?.content) return "";
  return result.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

export function createFeedSink(opts: FeedSinkOptions): FeedSink {
  let textBuf = "";
  let thinkingBuf = "";

  const emit = (item: FeedItem): void => {
    opts.events.emit(Ev.feedItem(opts.agentPath, opts.sessionKey, item));
    if (item.feed_type === "assistant_text_streaming" || item.feed_type === "thinking_streaming") {
      return; // streaming deltas are never persisted
    }
    try {
      opts.db.addChatFeedItem(opts.sessionId, item.feed_type, JSON.stringify(item.data), opts.source);
    } catch (e) {
      log.error("[sessions] persist feed item failed:", e);
    }
  };

  const onEvent = (event: AgentEvent): void => {
    switch (event.type) {
      case "turn_start":
        textBuf = "";
        thinkingBuf = "";
        break;

      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (ame.type === "text_delta") {
          textBuf += ame.delta;
          emit(Feed.assistantTextStreaming(textBuf));
        } else if (ame.type === "thinking_delta") {
          thinkingBuf += ame.delta;
          emit(Feed.thinkingStreaming(thinkingBuf));
        }
        break;
      }

      case "message_end": {
        const message = event.message;
        if (message.role !== "assistant") break;
        if (message.errorMessage) {
          const err: ProviderError = { kind: "unknown", message: message.errorMessage };
          emit(Feed.providerError(err));
          textBuf = "";
          thinkingBuf = "";
          break;
        }
        for (const block of message.content) {
          if (block.type === "text" && block.text) emit(Feed.assistantText(block.text));
          else if (block.type === "thinking" && block.thinking) emit(Feed.thinking(block.thinking));
          else if (block.type === "toolCall") emit(Feed.toolCall(block.name, block.arguments));
        }
        textBuf = "";
        thinkingBuf = "";
        break;
      }

      case "tool_execution_end": {
        emit(Feed.toolResult(extractText(event.result), event.isError));
        break;
      }

      default:
        break;
    }
  };

  return { onEvent, emit };
}
