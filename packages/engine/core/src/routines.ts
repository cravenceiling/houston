/**
 * Routines + routine runs — data CRUD.
 *
 * Port of `houston-engine-core::routines::{mod,runs,types}`. Routines are
 * agent-scoped scheduled tasks persisted to `.houston/routines/routines.json`;
 * their execution history lives in `.houston/routine_runs/routine_runs.json`.
 * Both go through the same typed `.houston/<type>/<type>.json` store as board
 * activities, so the file watcher maps writes to `RoutinesChanged` /
 * `RoutineRunsChanged` automatically.
 *
 * This is the data layer the onboarding "Routine" mission gates on (create a
 * routine → list count increases → mission done). The cron RUNNER + scheduler
 * (firing real sessions on a schedule) is a later milestone; the scheduler
 * lifecycle endpoints are wired as explicit no-ops until then.
 */

import { randomUUID } from "node:crypto";
import type {
  NewRoutine,
  Routine,
  RoutineRun,
  RoutineRunUpdate,
  RoutineUpdate,
} from "@houston-ai/engine-protocol";
import { readJson, writeJson } from "./agent-store.ts";
import { CoreError } from "./error.ts";

const ROUTINES = "routines";
const RUNS = "routine_runs";
const MAX_RUNS_PER_ROUTINE = 50;

function nowIso(): string {
  return new Date().toISOString();
}

// ── Routines ────────────────────────────────────────────────────────────────

export function listRoutines(root: string): Routine[] {
  return readJson<Routine[]>(root, ROUTINES, []);
}

export function createRoutine(root: string, input: NewRoutine): Routine {
  const routines = listRoutines(root);
  const now = nowIso();
  const routine: Routine = {
    id: randomUUID(),
    name: input.name,
    description: input.description ?? "",
    prompt: input.prompt,
    schedule: input.schedule,
    enabled: input.enabled ?? true,
    suppress_when_silent: input.suppress_when_silent ?? true,
    timezone: input.timezone ?? null,
    integrations: input.integrations ?? [],
    created_at: now,
    updated_at: now,
  };
  routines.push(routine);
  writeJson(root, ROUTINES, routines);
  return routine;
}

export function updateRoutine(root: string, id: string, updates: RoutineUpdate): Routine {
  const routines = listRoutines(root);
  const routine = routines.find((r) => r.id === id);
  if (!routine) throw CoreError.notFound(`routine ${id}`);
  if (updates.name !== undefined) routine.name = updates.name;
  if (updates.description !== undefined) routine.description = updates.description;
  if (updates.prompt !== undefined) routine.prompt = updates.prompt;
  if (updates.schedule !== undefined) routine.schedule = updates.schedule;
  if (updates.enabled !== undefined) routine.enabled = updates.enabled;
  if (updates.suppress_when_silent !== undefined) {
    routine.suppress_when_silent = updates.suppress_when_silent;
  }
  if (updates.timezone !== undefined) routine.timezone = updates.timezone;
  if (updates.integrations !== undefined) routine.integrations = updates.integrations;
  routine.updated_at = nowIso();
  writeJson(root, ROUTINES, routines);
  return routine;
}

export function deleteRoutine(root: string, id: string): void {
  const routines = listRoutines(root);
  const next = routines.filter((r) => r.id !== id);
  if (next.length === routines.length) throw CoreError.notFound(`routine ${id}`);
  writeJson(root, ROUTINES, next);
}

// ── Routine runs ──────────────────────────────────────────────────────────────

export function listRoutineRuns(root: string): RoutineRun[] {
  return readJson<RoutineRun[]>(root, RUNS, []);
}

export function listRoutineRunsForRoutine(root: string, routineId: string): RoutineRun[] {
  return listRoutineRuns(root).filter((r) => r.routine_id === routineId);
}

/** Keep at most MAX_RUNS_PER_ROUTINE runs per routine; drop oldest (append-ordered). */
function prune(runs: RoutineRun[]): RoutineRun[] {
  const counts = new Map<string, number>();
  for (const run of runs) counts.set(run.routine_id, (counts.get(run.routine_id) ?? 0) + 1);
  const over = new Map<string, number>();
  for (const [id, c] of counts) {
    if (c > MAX_RUNS_PER_ROUTINE) over.set(id, c - MAX_RUNS_PER_ROUTINE);
  }
  if (over.size === 0) return runs;
  // Drop the first N (oldest) entries for each over-quota routine.
  return runs.filter((run) => {
    const drop = over.get(run.routine_id);
    if (drop && drop > 0) {
      over.set(run.routine_id, drop - 1);
      return false;
    }
    return true;
  });
}

export function createRoutineRun(root: string, routineId: string): RoutineRun {
  const runs = listRoutineRuns(root);
  const id = randomUUID();
  const run: RoutineRun = {
    id,
    routine_id: routineId,
    status: "running",
    session_key: `routine-${routineId}-run-${id}`,
    started_at: nowIso(),
  };
  runs.push(run);
  writeJson(root, RUNS, prune(runs));
  return run;
}

export function updateRoutineRun(root: string, id: string, updates: RoutineRunUpdate): RoutineRun {
  const runs = listRoutineRuns(root);
  const run = runs.find((r) => r.id === id);
  if (!run) throw CoreError.notFound(`routine run ${id}`);
  if (updates.status !== undefined) run.status = updates.status;
  if (updates.activity_id !== undefined) run.activity_id = updates.activity_id;
  if (updates.summary !== undefined) run.summary = updates.summary;
  if (updates.completed_at !== undefined) run.completed_at = updates.completed_at;
  if (updates.paused_until !== undefined) {
    if (updates.paused_until === null) delete run.paused_until;
    else run.paused_until = updates.paused_until;
  }
  writeJson(root, RUNS, runs);
  return run;
}
