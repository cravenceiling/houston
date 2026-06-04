/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Small shared primitives the variants compose: a number stepper, a time
 * field, and the Never / On date / After N end-condition control. Layout of
 * each variant stays its own — these are just the leaf inputs.
 */
import { cn } from "@houston-ai/core"
import { Minus, Plus } from "lucide-react"
import type { EndMode, Recurrence } from "./cron"

const fieldClass = cn(
  "rounded-lg border border-border/20 bg-background px-3 py-2 text-sm text-foreground",
  "outline-none transition-shadow focus:shadow-sm",
)

export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 999,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="inline-flex items-center rounded-lg border border-border/20 bg-background">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(clamp(value - 1))}
        className="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={value <= min}
      >
        <Minus className="size-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d]/g, ""))
          if (e.target.value === "") return onChange(min)
          if (!Number.isNaN(n)) onChange(clamp(n))
        }}
        className="w-10 bg-transparent text-center text-sm tabular-nums outline-none"
      />
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(clamp(value + 1))}
        className="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={value >= max}
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

export function TimeField({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (time: string) => void
  className?: string
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(fieldClass, className)}
    />
  )
}

const END_OPTS: { key: EndMode; label: string }[] = [
  { key: "never", label: "Never" },
  { key: "on", label: "On date" },
  { key: "after", label: "After…" },
]

/** Never / On [date] / After [N] runs. Always non-cron — the frame flags it. */
export function EndPicker({
  value,
  onChange,
}: {
  value: Recurrence
  onChange: (patch: Partial<Recurrence>) => void
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5">
        {END_OPTS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange({ endMode: o.key })}
            className={cn(
              "h-8 rounded-full px-3 text-xs font-medium transition-colors",
              value.endMode === o.key
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value.endMode === "on" && (
        <input
          type="date"
          value={value.endDate}
          onChange={(e) => onChange({ endDate: e.target.value })}
          className={fieldClass}
        />
      )}
      {value.endMode === "after" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <NumberStepper value={value.endCount} onChange={(endCount) => onChange({ endCount })} />
          <span>runs</span>
        </div>
      )}
    </div>
  )
}
