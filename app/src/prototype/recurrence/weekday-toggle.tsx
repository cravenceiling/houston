/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * The seven-pill S M T W T F S weekday selector — the single most universal
 * recurrence control (Google, Apple, Outlook all use it). Shared by the
 * variants that need a weekly day picker; each variant is still free to lay it
 * out differently around this core control.
 */
import { cn } from "@houston-ai/core"
import { WEEKDAYS_MIN, WEEKDAYS_SHORT } from "./format"

export function WeekdayToggle({
  value,
  onChange,
  size = "md",
}: {
  value: number[]
  onChange: (days: number[]) => void
  size?: "sm" | "md" | "lg"
}) {
  const toggle = (d: number) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))

  const dim = size === "lg" ? "size-11 text-sm" : size === "sm" ? "size-7 text-xs" : "size-9 text-xs"

  return (
    <div className="flex gap-1.5">
      {WEEKDAYS_MIN.map((label, d) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-label={WEEKDAYS_SHORT[d]}
            aria-pressed={on}
            onClick={() => toggle(d)}
            className={cn(
              "rounded-full font-medium transition-colors",
              dim,
              on
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border/20 text-muted-foreground hover:text-foreground hover:border-border/40",
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Quick "every weekday / weekends / every day" shortcut chips for the day picker. */
export function WeekdayShortcuts({ onPick }: { onPick: (days: number[]) => void }) {
  const opts: { label: string; days: number[] }[] = [
    { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
    { label: "Weekdays", days: [1, 2, 3, 4, 5] },
    { label: "Weekends", days: [0, 6] },
  ]
  return (
    <div className="flex gap-1.5">
      {opts.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onPick(o.days)}
          className="h-7 rounded-full border border-border/20 bg-background px-3 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-border/40"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
