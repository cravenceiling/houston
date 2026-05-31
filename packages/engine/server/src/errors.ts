/**
 * HTTP error mapping.
 *
 * Mirrors `engine/houston-engine-server/src/routes/error.rs`: every error a
 * handler produces becomes an `ErrorBody { error: { code, message, details? } }`
 * with the HTTP status the protocol assigns to that code. `CoreError`s map by
 * their code (and surface `kind` as `details.kind`); zod failures become
 * `BAD_REQUEST`; anything else is `INTERNAL`.
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ERROR_CODE_STATUS, type ErrorBody, type ErrorCode } from "@houston-ai/engine-protocol";
import { CoreError, type CoreErrorCode } from "@houston-ai/engine-core";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_CODE_STATUS[this.code];
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }

  static notFound(m: string): ApiError {
    return new ApiError("NOT_FOUND", m);
  }
  static badRequest(m: string): ApiError {
    return new ApiError("BAD_REQUEST", m);
  }
  static unauthorized(m: string): ApiError {
    return new ApiError("UNAUTHORIZED", m);
  }
  static internal(m: string): ApiError {
    return new ApiError("INTERNAL", m);
  }
}

const CORE_TO_API: Record<CoreErrorCode, ErrorCode> = {
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  BAD_REQUEST: "BAD_REQUEST",
  UNAVAILABLE: "UNAVAILABLE",
  INTERNAL: "INTERNAL",
};

/**
 * Detect a zod `ZodError` structurally. Doing this by `name` + `issues` rather
 * than `instanceof ZodError` keeps the server free of a direct zod dependency
 * and survives multiple zod copies in the workspace (a thrown error from
 * `@houston-ai/engine-protocol`'s zod would fail an `instanceof` against the
 * server's own copy).
 */
function isZodErrorLike(err: unknown): err is { issues: unknown } {
  return err instanceof Error && err.name === "ZodError" && "issues" in err;
}

export function errorToBody(err: unknown): { body: ErrorBody; status: number } {
  if (err instanceof ApiError) {
    return { body: err.toBody(), status: err.status };
  }
  if (err instanceof CoreError) {
    const code = CORE_TO_API[err.code];
    const details = err.kind !== undefined ? { kind: err.kind } : undefined;
    return {
      body: { error: { code, message: err.message, ...(details ? { details } : {}) } },
      status: ERROR_CODE_STATUS[code],
    };
  }
  if (isZodErrorLike(err)) {
    return {
      body: {
        error: { code: "BAD_REQUEST", message: "invalid request body", details: { issues: err.issues } },
      },
      status: 400,
    };
  }
  const message = err instanceof Error ? err.message : "internal error";
  return { body: { error: { code: "INTERNAL", message } }, status: 500 };
}

/** Hono `onError` handler. */
export function onError(err: Error, c: Context): Response {
  const { body, status } = errorToBody(err);
  return c.json(body, status as ContentfulStatusCode);
}
