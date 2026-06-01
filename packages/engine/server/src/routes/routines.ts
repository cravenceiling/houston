import { Hono } from "hono";
import { type EngineState, log } from "@houston-ai/engine-core";
import { ApiError } from "../errors.ts";
import { empty } from "../http.ts";

/**
 * `/v1/routines/*` — routine scheduler lifecycle + manual trigger. Mirrors the
 * scheduler slice of `routes/routines.rs` (the data CRUD lives under
 * `/agents/routines*` in `files.ts`, matching the engine-client).
 *
 * The cron RUNNER (firing real agent sessions on a schedule) is a later
 * milestone. Until it lands, the scheduler lifecycle endpoints are honest
 * no-ops that return 200 so app boot (which calls `startRoutineScheduler` for
 * each agent) succeeds — but `run-now` and `:cancel`, which the user triggers
 * expecting an actual run, return an explicit UNAVAILABLE instead of pretending
 * to have run (no silent failures).
 */
export function routineRoutes(_engine: EngineState): Hono {
  const r = new Hono();
  const agentPath = (c: { req: { query(k: string): string | undefined } }): string => {
    const v = c.req.query("agentPath");
    if (!v) throw ApiError.badRequest("agentPath is required");
    return v;
  };

  // Scheduler lifecycle — no-ops until the runner lands. Boot calls start/sync
  // for every agent; they must succeed so the app finishes loading.
  r.post("/routines/scheduler/start", (c) => {
    log.debug(`[routines] scheduler start (no-op until runner): ${agentPath(c)}`);
    return empty();
  });
  r.post("/routines/scheduler/stop", (c) => {
    agentPath(c);
    return empty();
  });
  r.post("/routines/scheduler/sync", (c) => {
    agentPath(c);
    return empty();
  });

  // Manual trigger — the user expects a real run, so don't fake success.
  const notYet = () => {
    throw new ApiError(
      "UNAVAILABLE",
      "Running routines on a schedule isn't available on this engine yet.",
    );
  };
  r.post("/routines/:id/run-now", notYet);
  r.post("/routines/:id/runs/:runAction", notYet);

  return r;
}
