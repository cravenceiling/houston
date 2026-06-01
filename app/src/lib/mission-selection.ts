/**
 * Pure helpers for partitioning missions by archived state and for the
 * bulk "move to" targets. No engine / React imports so it stays unit-
 * testable and reusable from both the board tab and the archived tab.
 */

/** The status that hides a mission from the active board and surfaces it in
 *  the Archived missions tab. Matches `activity.schema.json`. */
export const ARCHIVED_STATUS = "archived";

/** Statuses a multi-selection can be moved to from the bulk action bar.
 *  Deliberately excludes `running` (you don't manually "move" a mission
 *  into running — sending a message does that) and `error`/`archived`. */
export const BULK_MOVE_TARGETS = ["done", "needs_you"] as const;
export type BulkMoveTarget = (typeof BULK_MOVE_TARGETS)[number];

export function isArchived<T extends { status: string }>(item: T): boolean {
  return item.status === ARCHIVED_STATUS;
}

/** Missions shown on the active board (everything not archived). */
export function selectActive<T extends { status: string }>(items: T[]): T[] {
  return items.filter((item) => !isArchived(item));
}

/** Missions shown in the Archived missions tab. */
export function selectArchived<T extends { status: string }>(items: T[]): T[] {
  return items.filter(isArchived);
}
