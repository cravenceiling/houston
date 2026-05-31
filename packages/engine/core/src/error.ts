/**
 * Domain error type.
 *
 * Port of `houston-engine-core::CoreError`. Carries a stable code the HTTP
 * layer maps 1:1 to an `ErrorCode` + HTTP status, plus an optional machine
 * `kind` that surfaces as `error.details.kind` for clients that match on it.
 */

export type CoreErrorCode = "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" | "UNAVAILABLE" | "INTERNAL";

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly kind?: string;

  constructor(code: CoreErrorCode, message: string, kind?: string) {
    super(message);
    this.name = "CoreError";
    this.code = code;
    this.kind = kind;
  }

  static notFound(message: string): CoreError {
    return new CoreError("NOT_FOUND", message);
  }
  static conflict(message: string): CoreError {
    return new CoreError("CONFLICT", message);
  }
  static badRequest(message: string): CoreError {
    return new CoreError("BAD_REQUEST", message);
  }
  static unavailable(message: string): CoreError {
    return new CoreError("UNAVAILABLE", message);
  }
  static internal(message: string): CoreError {
    return new CoreError("INTERNAL", message);
  }
  /** Code + machine-readable `kind` (surfaces as `error.details.kind`). */
  static labeled(code: CoreErrorCode, kind: string, message: string): CoreError {
    return new CoreError(code, message, kind);
  }
}

export function isCoreError(e: unknown): e is CoreError {
  return e instanceof CoreError;
}
