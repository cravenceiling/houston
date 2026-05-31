/**
 * In-process event bus.
 *
 * The analogue of `houston-ui-events::BroadcastEventSink`: domain code emits
 * `HoustonEvent`s; the WebSocket layer subscribes and fans them out to clients.
 * Emission is synchronous fan-out to every listener — each listener (a WS
 * connection forwarder) is responsible for its own bounded queue + backpressure,
 * exactly as the Rust per-connection mpsc does. A throwing listener never
 * poisons the others.
 */

import type { HoustonEvent } from "@houston-ai/engine-protocol";
import { log } from "./log.ts";

export type EventListener = (event: HoustonEvent) => void;

export class EventBus {
  private readonly listeners = new Set<EventListener>();

  emit(event: HoustonEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        log.error("[events] listener threw:", err);
      }
    }
  }

  /** Register a listener. Returns an unsubscribe function. */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
