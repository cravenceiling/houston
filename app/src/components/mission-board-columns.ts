import type { ReactNode } from "react";
import type { KanbanColumnConfig } from "@houston-ai/board";

interface MissionBoardColumnLabels {
  running: string;
  needsYou: string;
  done: string;
  newMission: string;
}

interface MissionBoardColumnOptions {
  /** Node rendered in the Done column header (e.g. an "archive all" button). */
  doneHeaderAction?: ReactNode;
}

export function buildMissionBoardColumns(
  labels: MissionBoardColumnLabels,
  onNewMission: () => void,
  options?: MissionBoardColumnOptions,
): KanbanColumnConfig[] {
  return [
    {
      id: "running",
      label: labels.running,
      statuses: ["running"],
      onAdd: onNewMission,
      addLabel: labels.newMission,
    },
    { id: "needs_you", label: labels.needsYou, statuses: ["needs_you", "error"] },
    {
      id: "done",
      label: labels.done,
      statuses: ["done", "cancelled"],
      headerAction: options?.doneHeaderAction,
    },
  ];
}
