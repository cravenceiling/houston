// Pure helpers for Houston's split Sentry transport + capture-id resolution.
//
// Imported by lib/sentry.ts (which wires the real @sentry/browser transports)
// AND by the node:test runner, so this module stays dependency-free: no
// @sentry/browser, no tauri-plugin-sentry-api, no DOM. Only structural types +
// plain logic. See lib/sentry-replay.ts for the same pattern and rationale.
//
// Why a split transport: Houston pipes every Sentry envelope through the Tauri
// IPC transport into the Rust SDK, whose parser can't decode Session Replay
// items and drops the whole envelope. So replay envelopes are peeled off and
// sent straight to Sentry over HTTP, while everything else stays on IPC.

/** Minimal shape of a Sentry transport's `send` — we only ever call it. */
export interface SendOnly<Env, Res> {
  send: (envelope: Env) => Res;
}

/** Minimal shape of a Sentry transport's `flush`. Matches the real Sentry
 *  `Transport.flush`, which returns `PromiseLike<boolean>` (not `Promise`). */
export interface FlushOnly {
  flush: (timeout?: number) => PromiseLike<boolean>;
}

/**
 * Route an envelope to the `fetch` (direct HTTP) transport when `isReplay`
 * matches, otherwise to the `ipc` (Rust SDK) transport. Generic over the
 * envelope + result types so the real Sentry `Transport` slots in unchanged.
 */
export function makeSplitTransportSend<Env, Res>(
  ipc: SendOnly<Env, Res>,
  fetch: SendOnly<Env, Res>,
  isReplay: (envelope: Env) => boolean,
): (envelope: Env) => Res {
  return (envelope) =>
    isReplay(envelope) ? fetch.send(envelope) : ipc.send(envelope);
}

/**
 * A combined flush that resolves true only when BOTH underlying transports
 * flush successfully — neither the IPC nor the direct-HTTP queue is left
 * holding events.
 */
export function makeSplitTransportFlush(
  ipc: FlushOnly,
  fetch: FlushOnly,
): (timeout?: number) => Promise<boolean> {
  return (timeout) =>
    Promise.all([ipc.flush(timeout), fetch.flush(timeout)]).then((results) =>
      results.every(Boolean),
    );
}

/**
 * The event id to report back to the caller of `captureException`. Sentry
 * returns an id synchronously, but we only hand it to the UI once the transport
 * confirms the envelope left its queue (`flushed`). On a failed flush we return
 * "" so the caller does NOT show a "report sent" confirmation it can't honor.
 */
export function resolveCapturedEventId(eventId: string, flushed: boolean): string {
  return flushed ? eventId : "";
}
