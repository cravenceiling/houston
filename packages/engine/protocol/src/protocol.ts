/**
 * Core wire protocol — the transport-level contract every Houston client
 * speaks to the engine.
 *
 * Mirrors `engine/houston-engine-protocol/src/lib.rs`. The Rust side is the
 * source of truth; this is the hand-maintained TypeScript mirror (matching
 * `ui/engine-client/src/types.ts`). Serialization rules — field casing, the
 * `{type,data}` event tag, SCREAMING_SNAKE error codes — must match the Rust
 * serde output byte-for-byte or the desktop/mobile/example clients break.
 */

/** Protocol major version. Bumped on breaking changes. */
export const PROTOCOL_VERSION = 1 as const;

/** Response header carrying the engine semver on every response. */
export const HEADER_ENGINE_VERSION = "X-Houston-Engine-Version";

export type EnvelopeKind = "event" | "req" | "res" | "ping" | "pong";

/** Envelope wrapping every WebSocket frame. */
export interface EngineEnvelope<P = unknown> {
  /** Protocol version (currently 1). */
  v: number;
  /** Correlation id (UUID). */
  id: string;
  /** Frame kind. */
  kind: EnvelopeKind;
  /** Unix epoch milliseconds the frame was produced. */
  ts: number;
  /** Inner payload; shape depends on `kind`. */
  payload: P;
}

/** Client -> server WebSocket request operations (`kind: "req"`). */
export type ClientRequest =
  | { op: "sub"; topics: string[] }
  | { op: "unsub"; topics: string[] };

/**
 * Emitted on the WS (as an `event` frame payload) when the server drops
 * events under backpressure. The Rust struct is `{ dropped }`, but the
 * forwarder wraps it as `{ type: "Lag", dropped }` so clients can
 * distinguish it from a `HoustonEvent`.
 */
export interface LagMarker {
  type: "Lag";
  dropped: number;
}

/** Fixed REST error code enum. Serializes SCREAMING_SNAKE_CASE. */
export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "INTERNAL"
  | "UNAVAILABLE"
  | "VERSION_MISMATCH";

/** REST error body. */
export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Optional machine-readable payload; `details.kind` is read by clients. */
    details?: unknown;
  };
}

export interface HealthResponse {
  status: "ok";
  version: string;
  protocol: number;
}

export interface VersionResponse {
  engine: string;
  protocol: number;
  build: string | null;
}

/** HTTP status for each error code (mirror of `routes/error.rs`). */
export const ERROR_CODE_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  INTERNAL: 500,
  UNAVAILABLE: 503,
  VERSION_MISMATCH: 409,
};
