import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  ARCHIVED_STATUS,
  BULK_MOVE_TARGETS,
  isArchived,
  selectActive,
  selectArchived,
} from "../src/lib/mission-selection.ts";
import { buildMissionBoardColumns } from "../src/components/mission-board-columns.ts";

describe("mission selection", () => {
  const items = [
    { status: "running" },
    { status: "archived" },
    { status: "done" },
    { status: "archived" },
  ];

  it("partitions archived vs active missions", () => {
    strictEqual(selectArchived(items).length, 2);
    deepStrictEqual(
      selectActive(items).map((i) => i.status),
      ["running", "done"],
    );
    ok(isArchived({ status: ARCHIVED_STATUS }));
    ok(!isArchived({ status: "running" }));
  });

  it("limits bulk move targets to done + needs_you", () => {
    const targets = BULK_MOVE_TARGETS as readonly string[];
    ok(!targets.includes("running"));
    ok(!targets.includes("error"));
    ok(!targets.includes(ARCHIVED_STATUS));
    deepStrictEqual([...BULK_MOVE_TARGETS], ["done", "needs_you"]);
  });

  it("keeps archived out of every board column", () => {
    const columns = buildMissionBoardColumns(
      { running: "R", needsYou: "N", done: "D", newMission: "+" },
      () => {},
    );
    const allStatuses = columns.flatMap((c) => c.statuses);
    ok(!allStatuses.includes(ARCHIVED_STATUS));
  });
});
