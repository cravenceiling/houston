/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Floating bottom bar to flip between the four variants. Updates ?variant= so a
 * choice is shareable + reload-stable; ← / → also cycle (unless typing in a
 * field). Self-gated out of production builds as defense in depth — the
 * prototype.html entry isn't part of `vite build` to begin with.
 */
import { useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

export interface VariantMeta {
  key: string
  name: string
}

export function Switcher({
  variants,
  current,
  onSelect,
}: {
  variants: VariantMeta[]
  current: string
  onSelect: (key: string) => void
}) {
  const idx = Math.max(0, variants.findIndex((v) => v.key === current))
  const step = (delta: number) => onSelect(variants[(idx + delta + variants.length) % variants.length].key)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      if (typing) return
      if (e.key === "ArrowLeft") step(-1)
      if (e.key === "ArrowRight") step(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (import.meta.env.PROD) return null

  return (
    <div className="fixed bottom-5 left-1/2 z-[1000] -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-gray-950 px-1.5 py-1.5 text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() => step(-1)}
          className="grid size-8 place-items-center rounded-full hover:bg-white/10"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-[200px] px-2 text-center text-sm font-medium tabular-nums">
          <span className="text-white/50">{variants[idx].key}</span> — {variants[idx].name}
        </div>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => step(1)}
          className="grid size-8 place-items-center rounded-full hover:bg-white/10"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        ← / → to switch · {variants.length} variants
      </p>
    </div>
  )
}
