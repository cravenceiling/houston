import { useCallback, useEffect, useRef, useState } from "react"
import { columnDragRole } from "./dnd"
import {
  columnIdAt,
  draggableCardIdAt,
  endDragCursor,
  setDragForbidden,
  startDragCursor,
} from "./board-drag-dom"
import type { KanbanColumn, KanbanItem } from "./types"

/** Pointer travel (px) before a press becomes a drag. Below this, the press is
 *  treated as a click so card selection still works. */
const DRAG_THRESHOLD_PX = 4

export interface UseBoardDragArgs {
  items: KanbanItem[]
  columns: KanbanColumn[]
  /** Whether a drag may start at all (dnd enabled AND no multi-select active). */
  enabled: boolean
  /** Whether `columnId` accepts `item` as a real move. */
  canDrop: (item: KanbanItem, columnId: string) => boolean
  /** Commit a move when a card is released on an eligible column. */
  onItemMove?: (item: KanbanItem, toColumnId: string) => void
}

export interface BoardDragHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  /** Eats the click that follows a drag so it doesn't also select the card. */
  onClickCapture: (e: React.MouseEvent) => void
}

export interface UseBoardDrag {
  /** Id of the card being dragged, or null. */
  draggingId: string | null
  /** Column id under the pointer during a drag, or null. */
  hoverColumnId: string | null
  /** Spread onto the board container. */
  dragHandlers: BoardDragHandlers
}

interface Gesture {
  pointerId: number
  item: KanbanItem
  startX: number
  startY: number
  started: boolean
  boardEl: HTMLElement
}

/**
 * Custom pointer-events drag for kanban cards, owned entirely by the board (no
 * native HTML5 DnD). Because we drive the drag ourselves, the cursor is the
 * SAME on every OS — set via `body` classes in globals.css — instead of the
 * per-OS cursor the browser picks for a native drag.
 *
 * Wiring is delegated: the board spreads `dragHandlers` on its container, cards
 * carry `data-kanban-card`/`data-kanban-draggable`, columns carry
 * `data-kanban-column`. A press on a draggable card starts a gesture; once the
 * pointer travels past the threshold it becomes a drag (cursor + dim + column
 * highlight); releasing over an eligible column commits the move.
 */
export function useBoardDrag({
  items,
  columns,
  enabled,
  canDrop,
  onItemMove,
}: UseBoardDragArgs): UseBoardDrag {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverColumnId, setHoverColumnId] = useState<string | null>(null)

  const gesture = useRef<Gesture | null>(null)
  // Set when a drag ends so the click that fires right after is swallowed
  // (otherwise releasing a drag would also select the card).
  const justDragged = useRef(false)

  const finish = useCallback(() => {
    const g = gesture.current
    if (g?.started) {
      if (g.boardEl.hasPointerCapture(g.pointerId)) {
        g.boardEl.releasePointerCapture(g.pointerId)
      }
      endDragCursor()
    }
    gesture.current = null
    setDraggingId(null)
    setHoverColumnId(null)
  }, [])

  // Escape cancels an in-flight drag (no move). One stable listener for the
  // board's lifetime; also clears any stray drag cursor on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gesture.current?.started) finish()
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      endDragCursor()
    }
  }, [finish])

  const roleAt = useCallback(
    (item: KanbanItem, x: number, y: number) => {
      const colId = columnIdAt(x, y)
      const col = colId ? columns.find((c) => c.id === colId) : undefined
      const role = col
        ? columnDragRole(item, col, canDrop(item, col.id))
        : "idle"
      return { colId, role }
    },
    [columns, canDrop],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      justDragged.current = false
      if (!enabled || e.button !== 0 || e.pointerType === "touch") return
      const id = draggableCardIdAt(e.target)
      if (!id) return
      const item = items.find((i) => i.id === id)
      if (!item) return
      gesture.current = {
        pointerId: e.pointerId,
        item,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        boardEl: e.currentTarget as HTMLElement,
      }
    },
    [enabled, items],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      if (!g.started) {
        if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD_PX) {
          return
        }
        g.started = true
        setDraggingId(g.item.id)
        startDragCursor()
        g.boardEl.setPointerCapture(g.pointerId)
      }
      const { colId, role } = roleAt(g.item, e.clientX, e.clientY)
      setHoverColumnId(colId)
      setDragForbidden(role === "forbidden")
    },
    [roleAt],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      if (g.started) {
        justDragged.current = true
        const { colId, role } = roleAt(g.item, e.clientX, e.clientY)
        if (colId && role === "drop-target") onItemMove?.(g.item, colId)
      }
      finish()
    },
    [roleAt, onItemMove, finish],
  )

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      finish()
    },
    [finish],
  )

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (justDragged.current) {
      justDragged.current = false
      e.stopPropagation()
    }
  }, [])

  return {
    draggingId,
    hoverColumnId,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
    },
  }
}
