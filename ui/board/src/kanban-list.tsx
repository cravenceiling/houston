import { AnimatePresence, motion } from "framer-motion"
import { KanbanCard, type KanbanCardLabels } from "./kanban-card"
import type { KanbanItem } from "./types"

export interface KanbanListProps {
  items: KanbanItem[]
  selectedId?: string | null
  highlightedId?: string | null
  onSelect: (item: KanbanItem) => void
  onDelete?: (item: KanbanItem) => void
  onRename?: (item: KanbanItem, newTitle: string) => void
  runningStatuses?: string[]
  approveStatuses?: string[]
  errorStatuses?: string[]
  actions?: (item: KanbanItem) => React.ReactNode
  avatar?: React.ReactNode
  cardLabels?: KanbanCardLabels
  emptyState?: React.ReactNode
}

/**
 * Single-column list rendering of board items. Reuses `KanbanCard` so the
 * click-to-open-chat, rename, and delete affordances match the kanban
 * board exactly — the only difference is the vertical, column-less layout
 * (used by the Archived missions tab). Items are sorted newest-first.
 */
export function KanbanList({
  items,
  selectedId,
  highlightedId,
  onSelect,
  onDelete,
  onRename,
  runningStatuses,
  approveStatuses,
  errorStatuses,
  actions,
  avatar,
  cardLabels,
  emptyState,
}: KanbanListProps) {
  if (items.length === 0 && emptyState) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        {emptyState}
      </div>
    )
  }

  const sorted = [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
      <div className="mx-auto w-full max-w-2xl space-y-1.5">
        <AnimatePresence mode="popLayout">
          {sorted.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <KanbanCard
                item={item}
                selected={selectedId === item.id}
                highlighted={highlightedId === item.id}
                onSelect={() => onSelect(item)}
                onDelete={onDelete ? () => onDelete(item) : undefined}
                onRename={onRename ? (title) => onRename(item, title) : undefined}
                runningStatuses={runningStatuses}
                approveStatuses={approveStatuses}
                errorStatuses={errorStatuses}
                actions={actions?.(item)}
                avatar={avatar}
                labels={cardLabels}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
