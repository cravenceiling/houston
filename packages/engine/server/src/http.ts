/**
 * Small HTTP helpers.
 */

/**
 * Empty `200` response with an explicit `Content-Length: 0`.
 *
 * The engine-client parses the body as JSON unless the status is `204` or
 * `Content-Length` is `"0"` (see `ui/engine-client/src/client.ts`). axum's
 * empty-`()` handlers emit exactly this, so mutating routes that return nothing
 * must too, or the client throws parsing an empty body.
 */
export function empty(): Response {
  return new Response(null, { status: 200, headers: { "content-length": "0" } });
}
