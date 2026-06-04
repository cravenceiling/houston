/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * VARIANT A — "Repeat every N …" builder. The consensus calendar pattern
 * (Google Calendar custom recurrence + Outlook). A frequency control drives
 * conditional reveals: Weekly → day pills, Monthly → day-vs-Nth-weekday,
 * Yearly → month + day. Stacked form rows; the interval+unit pair is the
 * primary affordance.
 */
import { cn } from "@houston-ai/core"
import type { Freq, Recurrence } from "./cron"
import { MONTHS_LONG, WEEKDAYS_LONG, ordinalWord } from "./format"
import { NumberStepper, TimeField, EndPicker } from "./controls"
import { WeekdayToggle, WeekdayShortcuts } from "./weekday-toggle"

const FREQS: { key: Freq; label: string }[] = [
  { key: "minute", label: "minute" },
  { key: "hour", label: "hour" },
  { key: "day", label: "day" },
  { key: "week", label: "week" },
  { key: "month", label: "month" },
  { key: "year", label: "year" },
]

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{children}</label>
)

const selectClass = cn(
  "rounded-lg border border-border/20 bg-background px-3 py-2 text-sm text-foreground",
  "outline-none transition-shadow focus:shadow-sm",
)

type Patch = (p: Partial<Recurrence>) => void

export function VariantA({ rec, onChange }: { rec: Recurrence; onChange: Patch }) {
  const showTime = rec.freq !== "minute" && rec.freq !== "hour"

  return (
    <div className="space-y-5">
      {/* Repeat every N [unit] */}
      <div>
        <Label>Repeat every</Label>
        <div className="flex flex-wrap items-center gap-2">
          <NumberStepper value={rec.interval} onChange={(interval) => onChange({ interval })} />
          <div className="flex flex-wrap gap-1.5">
            {FREQS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => onChange({ freq: f.key })}
                className={cn(
                  "h-9 rounded-full px-3 text-xs font-medium transition-colors",
                  rec.freq === f.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                {rec.interval > 1 ? "s" : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* WEEKLY — day pills */}
      {rec.freq === "week" && (
        <div className="space-y-2.5">
          <Label>On these days</Label>
          <WeekdayToggle value={rec.weekdays} onChange={(weekdays) => onChange({ weekdays })} />
          <WeekdayShortcuts onPick={(weekdays) => onChange({ weekdays })} />
        </div>
      )}

      {/* MONTHLY — day vs Nth weekday. role=radio rows so inputs aren't nested in a button. */}
      {rec.freq === "month" && (
        <div className="space-y-2">
          <div
            role="radio"
            aria-checked={rec.monthMode === "day"}
            tabIndex={0}
            onClick={() => onChange({ monthMode: "day" })}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange({ monthMode: "day" })}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
              rec.monthMode === "day" ? "border-primary/40 bg-primary/[0.04]" : "border-border/20 hover:border-border/40",
            )}
          >
            <span className={cn("size-3.5 shrink-0 rounded-full border", rec.monthMode === "day" ? "border-4 border-primary" : "border-border/40")} />
            On day
            <input
              type="number"
              min={1}
              max={31}
              value={rec.monthDay}
              onChange={(e) => onChange({ monthDay: Math.min(31, Math.max(1, Number(e.target.value))) })}
              className={cn(selectClass, "w-16")}
            />
          </div>
          <div
            role="radio"
            aria-checked={rec.monthMode === "weekday"}
            tabIndex={0}
            onClick={() => onChange({ monthMode: "weekday" })}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange({ monthMode: "weekday" })}
            className={cn(
              "flex w-full cursor-pointer flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
              rec.monthMode === "weekday" ? "border-primary/40 bg-primary/[0.04]" : "border-border/20 hover:border-border/40",
            )}
          >
            <span className={cn("size-3.5 shrink-0 rounded-full border", rec.monthMode === "weekday" ? "border-4 border-primary" : "border-border/40")} />
            On the
            <select
              value={rec.monthOrdinal}
              onChange={(e) => onChange({ monthOrdinal: Number(e.target.value) })}
              className={cn(selectClass, "py-1.5")}
            >
              {[1, 2, 3, 4, 5, -1].map((o) => (
                <option key={o} value={o}>{ordinalWord(o)}</option>
              ))}
            </select>
            <select
              value={rec.monthWeekday}
              onChange={(e) => onChange({ monthWeekday: Number(e.target.value) })}
              className={cn(selectClass, "py-1.5")}
            >
              {WEEKDAYS_LONG.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* YEARLY — month + day */}
      {rec.freq === "year" && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Month</Label>
            <select
              value={rec.yearMonth}
              onChange={(e) => onChange({ yearMonth: Number(e.target.value) })}
              className={selectClass}
            >
              {MONTHS_LONG.map((mo, i) => (
                <option key={mo} value={i + 1}>{mo}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Day</Label>
            <input
              type="number"
              min={1}
              max={31}
              value={rec.monthDay}
              onChange={(e) => onChange({ monthDay: Math.min(31, Math.max(1, Number(e.target.value))) })}
              className={cn(selectClass, "w-20")}
            />
          </div>
        </div>
      )}

      {/* Time-of-day */}
      {showTime && (
        <div>
          <Label>At</Label>
          <TimeField value={rec.time} onChange={(time) => onChange({ time })} />
        </div>
      )}

      {/* Ends */}
      <div>
        <Label>Ends</Label>
        <EndPicker value={rec} onChange={onChange} />
      </div>
    </div>
  )
}
