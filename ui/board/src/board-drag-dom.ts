/**
 * DOM glue for the board's pointer-events card drag (see use-board-drag). Kept
 * apart from the React hook so the hit-testing + cursor concerns stay pure and
 * independently testable. The components set the matching literal attributes
 * (`data-kanban-card` / `data-kanban-draggable` on a card root,
 * `data-kanban-column` on a column root) — TypeScript only allows a hyphenated
 * `data-*` name as a literal JSX attribute, not via object spread, so the names
 * live here for the query side and as literals there.
 */

const CARD_ID_ATTR = "data-kanban-card"
const CARD_DRAGGABLE_ATTR = "data-kanban-draggable"
const COLUMN_ID_ATTR = "data-kanban-column"

/** Controls inside a card whose own click/press must win — a press here never
 *  starts a card drag. */
const INTERACTIVE_SELECTOR =
  "button, input, textarea, select, a, [role='checkbox']"

/** Drives the global drag cursor; see the `body.kanban-dragging` rules in
 *  globals.css. One cursor on every OS because the board owns the drag. */
const DRAGGING_CLASS = "kanban-dragging"
const FORBIDDEN_CLASS = "kanban-dragging-forbidden"

/** Id of the draggable card under `target`, or null — also null when the press
 *  landed on an interactive control that owns its own gesture. */
export function draggableCardIdAt(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  if (target.closest(INTERACTIVE_SELECTOR)) return null
  return (
    target.closest(`[${CARD_DRAGGABLE_ATTR}]`)?.getAttribute(CARD_ID_ATTR) ??
    null
  )
}

/** Id of the column at viewport point (x, y), or null. */
export function columnIdAt(x: number, y: number): string | null {
  return (
    document
      .elementFromPoint(x, y)
      ?.closest(`[${COLUMN_ID_ATTR}]`)
      ?.getAttribute(COLUMN_ID_ATTR) ?? null
  )
}

/** Begin the global drag cursor and drop any text selection the press started. */
export function startDragCursor(): void {
  document.body.classList.add(DRAGGING_CLASS)
  window.getSelection()?.removeAllRanges()
}

/** Swap the cursor to `not-allowed` over a forbidden section (and back). */
export function setDragForbidden(forbidden: boolean): void {
  document.body.classList.toggle(FORBIDDEN_CLASS, forbidden)
}

/** Clear the global drag cursor (drag ended, cancelled, or unmounted). */
export function endDragCursor(): void {
  document.body.classList.remove(DRAGGING_CLASS, FORBIDDEN_CLASS)
}
