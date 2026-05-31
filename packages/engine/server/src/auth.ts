/**
 * Bearer token auth.
 *
 * Port of `engine/houston-engine-server/src/auth.rs`. A token is accepted from
 * three locations (in order): `Authorization: Bearer <t>`, the
 * `Sec-WebSocket-Protocol: houston-bearer.<t>` header (browsers can't set
 * Authorization on WS upgrades), or a `?token=<t>` query param. The bootstrap
 * token is constant-time compared. Device-scoped tokens (the `engine_tokens`
 * DB table minted during mobile pairing) land with the tunnel milestone.
 */

import type { Context, Next } from "hono";
import type { EngineState } from "@houston-ai/engine-core";
import { ApiError } from "./errors.ts";

const WS_PROTO_PREFIX = "houston-bearer.";

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice("Bearer ".length);

  const proto = req.headers.get("sec-websocket-protocol");
  if (proto) {
    for (const part of proto.split(",")) {
      const p = part.trim();
      if (p.startsWith(WS_PROTO_PREFIX)) return p.slice(WS_PROTO_PREFIX.length);
    }
  }

  const token = new URL(req.url).searchParams.get("token");
  if (token) return token;

  return null;
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function tokenValid(engine: EngineState, token: string): boolean {
  return constantTimeEq(token, engine.config.token);
}

/** Hono middleware enforcing a valid bearer token on every `/v1/*` route. */
export function authMiddleware(engine: EngineState) {
  return async (c: Context, next: Next): Promise<void> => {
    const token = extractBearer(c.req.raw);
    if (!token || !tokenValid(engine, token)) {
      throw ApiError.unauthorized("Missing or invalid bearer token");
    }
    await next();
  };
}
