/**
 * @houston-ai/engine-server
 *
 * HTTP + WebSocket server for the TypeScript Houston Engine. The binary entry
 * is `src/main.ts`; this barrel exposes the pieces for embedding/tests.
 */

export { buildApp } from "./router.ts";
export { makeWebSocketHandler, upgradeWs } from "./ws.ts";
export { ApiError, errorToBody, onError } from "./errors.ts";
export { extractBearer, tokenValid, authMiddleware } from "./auth.ts";
