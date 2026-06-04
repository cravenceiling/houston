/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * VARIANT C — "grid-first / show, don't configure". Leads with a big cadence
 * switch + a prominent time; the primary affordance is *tapping a visual grid*
 * (a large weekday strip or a month-day calendar) rather than dropdowns. Closest
 * to Apple Calendar and Houston's ethos. Sub-hour intervals demoted to "Hourly".
 */
import { cn } from "@houston-ai/core"
import { Clock } from "lucide-react"
import type { Freq, Recurrence } from "./cron"
import { MONTHS_SHORT, WEEKDAYS_LONG, ordinalWord } from "./format"
import { NumberStepper, EndPicker } from "./controls"
import { WeekdayToggle, WeekdayShortcuts } from "./weekday-toggle"

const CADENCE: { key: Freq; label: string }[] = [
  { key: "hour", label: "Hourly" },
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
]

type Patch = (p: Partial<Recurrence>) => void
const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-xs font-medium text-muted-foreground">{children}</p>
)

function MonthDayGrid({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={cn(
            "grid h-9 place-items-center rounded-lg text-xs tabular-nums transition-colors",
            value === d
              ? "bg-primary font-medium text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-secondary",
          )}
        >
          {d}
        </button>
      ))}
    </div>
  )
}

export function VariantC({ rec, onChange }: { rec: Recurrence; onChange: Patch }) {
  const showTime = rec.freq !== "hour"

  return (
    <div className="space-y-6">
      {/* Big cadence switch */}
      <div className="grid grid-cols-5 gap-1.5">
        {CADENCE.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange({ freq: c.key })}
            className={cn(
              "h-12 rounded-xl text-sm font-medium transition-colors",
              rec.freq === c.key
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* HOURLY */}
      {rec.freq === "hour" && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground">Run every</span>
          <NumberStepper value={rec.interval} onChange={(interval) => onChange({ interval })} max={23} />
          <span className="text-sm text-foreground">hour{rec.interval > 1 ? "s" : ""}, around the clock</span>
        </div>
      )}

      {/* DAILY */}
      {rec.freq === "day" && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground">Run every</span>
          <NumberStepper value={rec.interval} onChange={(interval) => onChange({ interval })} />
          <span className="text-sm text-foreground">day{rec.interval > 1 ? "s" : ""}</span>
        </div>
      )}

      {/* WEEKLY — big day strip */}
      {rec.freq === "week" && (
        <div className="space-y-3">
          <Label>Which days</Label>
          <WeekdayToggle value={rec.weekdays} onChange={(weekdays) => onChange({ weekdays })} size="lg" />
          <WeekdayShortcuts onPick={(weekdays) => onChange({ weekdays })} />
        </div>
      )}

      {/* MONTHLY — calendar day grid, with Nth-weekday alternative */}
      {rec.freq === "month" && (
        <div className="space-y-3">
          {rec.monthMode === "day" ? (
            <>
              <Label>Which day of the month</Label>
              <MonthDayGrid value={rec.monthDay} onChange={(monthDay) => onChange({ monthDay })} />
              <button
                type="button"
                onClick={() => onChange({ monthMode: "weekday" })}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                or pick by weekday (e.g. the second Tuesday) →
              </button>
            </>
          ) : (
            <>
              <Label>Which weekday</Label>
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                On the
                <select
                  value={rec.monthOrdinal}
                  onChange={(e) => onChange({ monthOrdinal: Number(e.target.value) })}
                  className="rounded-lg border border-border/20 bg-background px-2 py-1.5 outline-none"
                >
                  {[1, 2, 3, 4, 5, -1].map((o) => (
                    <option key={o} value={o}>{ordinalWord(o)}</option>
                  ))}
                </select>
                <select
                  value={rec.monthWeekday}
                  onChange={(e) => onChange({ monthWeekday: Number(e.target.value) })}
                  className="rounded-lg border border-border/20 bg-background px-2 py-1.5 outline-none"
                >
                  {WEEKDAYS_LONG.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => onChange({ monthMode: "day" })}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                ← or pick a day of the month
              </button>
            </>
          )}
        </div>
      )}

      {/* YEARLY — month chips + day grid */}
      {rec.freq === "year" && (
        <div className="space-y-3">
          <Label>Which month</Label>
          <div className="grid grid-cols-6 gap-1.5">
            {MONTHS_SHORT.map((mo, i) => (
              <button
                key={mo}
                type="button"
                onClick={() => onChange({ yearMonth: i + 1 })}
                className={cn(
                  "h-9 rounded-lg text-xs font-medium transition-colors",
                  rec.yearMonth === i + 1
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
                )}
              >
                {mo}
              </button>
            ))}
          </div>
          <Label>Which day</Label>
          <MonthDayGrid value={rec.monthDay} onChange={(monthDay) => onChange({ monthDay })} />
        </div>
      )}

      {/* TIME hero */}
      {showTime && (
        <div className="flex items-center gap-3 rounded-xl border border-border/20 bg-background px-4 py-3">
          <Clock className="size-5 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-sm text-foreground">At</span>
          <input
            type="time"
            value={rec.time}
            onChange={(e) => onChange({ time: e.target.value })}
            className="bg-transparent text-2xl font-light tabular-nums text-foreground outline-none"
          />
        </div>
      )}

      <div>
        <Label>Stop repeating</Label>
        <EndPicker value={rec} onChange={onChange} />
      </div>
    </div>
  )
}
