/**
 * WebSocket endpoint — `/v1/ws`.
 *
 * Port of `engine/houston-engine-server/src/ws.rs` onto Bun's native server
 * WebSocket. Each connection holds its own topic subscription set and a bounded
 * outbound queue. The bus-listener applies the same overflow policy as the Rust
 * forwarder:
 *   - low-severity streaming deltas (`AssistantTextStreaming`/`ThinkingStreaming`)
 *     are dropped silently when the queue is full (a final variant follows),
 *   - `SessionStatus` events coalesce (newest per topic),
 *   - everything else bumps a dropped counter and emits a `LagMarker` so the
 *     client knows to refetch.
 * Subscribing to the firehose topic `*` receives every event. Server pings
 * every 20s.
 */

import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import {
  type EngineEnvelope,
  type HoustonEvent,
  FIREHOSE,
  eventTopic,
  isLowSeverityFeed,
} from "@houston-ai/engine-protocol";
import type { EngineState } from "@houston-ai/engine-core";
import { extractBearer, tokenValid } from "./auth.ts";

const OUTBOUND_CAPACITY = 1024;
const HEARTBEAT_MS = 20_000;

interface ConnData {
  topics: Set<string>;
  queue: string[];
  /** Coalesced latest SessionStatus frame per topic, awaiting queue room. */
  pendingStatus: Map<string, string>;
  dropped: number;
  pendingLag: boolean;
  closed: boolean;
  unsub?: () => void;
  ping?: ReturnType<typeof setInterval>;
}

function envelope(kind: EngineEnvelope["kind"], payload: unknown): string {
  return JSON.stringify({ v: 1, id: crypto.randomUUID(), kind, ts: Date.now(), payload });
}

function isSubscribed(topics: Set<string>, topic: string): boolean {
  return topics.has(FIREHOSE) || topics.has(topic);
}

function deliver(ws: ServerWebSocket<ConnData>, event: HoustonEvent): void {
  const conn = ws.data;
  const topic = eventTopic(event);
  if (!isSubscribed(conn.topics, topic)) return;

  if (conn.queue.length < OUTBOUND_CAPACITY) {
    conn.queue.push(envelope("event", event));
    drainPendingStatus(conn);
  } else if (event.type === "FeedItem" && isLowSeverityFeed(event.data.item)) {
    conn.dropped += 1; // streaming delta — drop, a final follows
  } else if (event.type === "SessionStatus") {
    conn.pendingStatus.set(topic, envelope("event", event)); // coalesce newest
  } else {
    conn.dropped += 1;
    conn.pendingLag = true;
  }
  flush(ws);
}

function drainPendingStatus(conn: ConnData): void {
  if (conn.pendingStatus.size === 0) return;
  for (const [topic, frame] of conn.pendingStatus) {
    if (conn.queue.length >= OUTBOUND_CAPACITY) break;
    conn.queue.push(frame);
    conn.pendingStatus.delete(topic);
  }
}

function flush(ws: ServerWebSocket<ConnData>): void {
  const conn = ws.data;
  if (conn.closed) return;
  if (conn.pendingLag && conn.queue.length < OUTBOUND_CAPACITY) {
    conn.queue.push(envelope("event", { type: "Lag", dropped: conn.dropped }));
    conn.pendingLag = false;
  }
  while (conn.queue.length > 0) {
    const sent = ws.send(conn.queue[0]);
    if (sent === 0) break; // connection closing — leave the frame, stop
    conn.queue.shift();
    if (sent === -1) break; // backpressured but buffered — resume on `drain`
  }
}

function handleClientFrame(ws: ServerWebSocket<ConnData>, text: string): void {
  let env: EngineEnvelope;
  try {
    env = JSON.parse(text) as EngineEnvelope;
  } catch {
    return; // ignore malformed frames
  }
  if (env.kind !== "req") return;
  const payload = env.payload as { op?: string; topics?: unknown };
  if (!payload || !Array.isArray(payload.topics)) return;
  const topics = payload.topics.filter((t): t is string => typeof t === "string");
  if (payload.op === "sub") {
    for (const t of topics) ws.data.topics.add(t);
  } else if (payload.op === "unsub") {
    for (const t of topics) ws.data.topics.delete(t);
  }
}

/** Authenticate + upgrade a `/v1/ws` request. Returns a Response on failure. */
export function upgradeWs(
  engine: EngineState,
  req: Request,
  server: Server<ConnData>,
): Response | undefined {
  const token = extractBearer(req);
  if (!token || !tokenValid(engine, token)) {
    return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Missing or invalid bearer token" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const data: ConnData = {
    topics: new Set(),
    queue: [],
    pendingStatus: new Map(),
    dropped: 0,
    pendingLag: false,
    closed: false,
  };
  const ok = server.upgrade(req, { data });
  return ok ? undefined : new Response("WebSocket upgrade failed", { status: 426 });
}

export function makeWebSocketHandler(engine: EngineState): WebSocketHandler<ConnData> {
  return {
    open(ws) {
      ws.data.unsub = engine.events.subscribe((event) => deliver(ws, event));
      ws.data.ping = setInterval(() => {
        if (!ws.data.closed) ws.send(envelope("ping", {}));
      }, HEARTBEAT_MS);
    },
    message(ws, message) {
      handleClientFrame(ws, typeof message === "string" ? message : message.toString());
    },
    drain(ws) {
      flush(ws);
    },
    close(ws) {
      ws.data.closed = true;
      ws.data.unsub?.();
      if (ws.data.ping) clearInterval(ws.data.ping);
    },
  };
}
