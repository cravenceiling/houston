/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * VARIANT B — "fill-in-the-blank sentence". One readable line whose bracketed
 * tokens are tap-targets opening tiny popovers. Reads exactly like the summary
 * sentence everyone else shows as *output* — here it's also the input. No
 * stacked form, no modal; the primary affordance is tapping an underlined word.
 * Closest in spirit to Todoist's natural-language benefit without the parsing.
 */
import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@houston-ai/core"
import type { Freq, Recurrence } from "./cron"
import { MONTHS_LONG, WEEKDAYS_LONG, WEEKDAYS_SHORT, fmtTime, fmtDate, ordinalWord, ordinalNum, joinList } from "./format"
import { TimeField, EndPicker, NumberStepper } from "./controls"
import { WeekdayToggle, WeekdayShortcuts } from "./weekday-toggle"

const FREQS: Freq[] = ["minute", "hour", "day", "week", "month", "year"]
type Patch = (p: Partial<Recurrence>) => void

function Token({ label, children, wide }: { label: ReactNode; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "rounded-md bg-secondary px-1.5 font-medium text-foreground underline decoration-border decoration-dotted underline-offset-4 transition-colors hover:bg-gray-200",
          open && "bg-gray-200 ring-2 ring-primary/15",
        )}
      >
        {label}
      </button>
      {open && (
        <div
          className={cn(
            "absolute left-0 top-full z-50 mt-2 rounded-xl border border-black/10 bg-background p-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
            wide ? "w-72" : "w-auto",
          )}
        >
          {children}
        </div>
      )}
    </span>
  )
}

function freqLabel(r: Recurrence): string {
  const unit = r.freq
  return r.interval === 1 ? `every ${unit}` : `every ${r.interval} ${unit}s`
}

function detailLabel(r: Recurrence): string {
  if (r.freq === "week") {
    const set = [...r.weekdays].sort((a, b) => a - b)
    if (!set.length) return "pick days"
    return "on " + joinList(set.map((d) => WEEKDAYS_SHORT[d]))
  }
  if (r.freq === "month") {
    return r.monthMode === "day"
      ? `on the ${ordinalNum(r.monthDay)}`
      : `on the ${ordinalWord(r.monthOrdinal)} ${WEEKDAYS_LONG[r.monthWeekday]}`
  }
  if (r.freq === "year") return `on ${MONTHS_LONG[r.yearMonth - 1]} ${r.monthDay}`
  return ""
}

function endLabel(r: Recurrence): string {
  if (r.endMode === "on" && r.endDate) return `until ${fmtDate(new Date(`${r.endDate}T00:00`))}`
  if (r.endMode === "after") return `for ${r.endCount} runs`
  return "with no end"
}

const selectClass = "rounded-lg border border-border/20 bg-background px-2 py-1.5 text-sm text-foreground outline-none"

export function VariantB({ rec, onChange }: { rec: Recurrence; onChange: Patch }) {
  const showDetail = rec.freq === "week" || rec.freq === "month" || rec.freq === "year"
  const showTime = rec.freq !== "minute" && rec.freq !== "hour"

  return (
    <div className="py-2 text-xl leading-loose text-muted-foreground">
      Run{" "}
      <Token label={freqLabel(rec)}>
        <div className="space-y-3">
          <NumberStepper value={rec.interval} onChange={(interval) => onChange({ interval })} />
          <div className="grid grid-cols-3 gap-1.5">
            {FREQS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onChange({ freq: f })}
                className={cn(
                  "h-8 rounded-lg text-xs font-medium capitalize transition-colors",
                  rec.freq === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </Token>{" "}
      {showDetail && (
        <>
          <Token label={detailLabel(rec)} wide={rec.freq !== "year"}>
            {rec.freq === "week" && (
              <div className="space-y-2.5">
                <WeekdayToggle value={rec.weekdays} onChange={(weekdays) => onChange({ weekdays })} />
                <WeekdayShortcuts onPick={(weekdays) => onChange({ weekdays })} />
              </div>
            )}
            {rec.freq === "month" && (
              <div className="space-y-2 text-sm text-foreground">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={rec.monthMode === "day"} onChange={() => onChange({ monthMode: "day" })} />
                  on day
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={rec.monthDay}
                    onChange={(e) => onChange({ monthDay: Math.min(31, Math.max(1, Number(e.target.value))) })}
                    className={cn(selectClass, "w-16")}
                  />
                </label>
                <label className="flex flex-wrap items-center gap-1.5">
                  <input type="radio" checked={rec.monthMode === "weekday"} onChange={() => onChange({ monthMode: "weekday" })} />
                  on the
                  <select value={rec.monthOrdinal} onChange={(e) => onChange({ monthOrdinal: Number(e.target.value) })} className={selectClass}>
                    {[1, 2, 3, 4, 5, -1].map((o) => (
                      <option key={o} value={o}>{ordinalWord(o)}</option>
                    ))}
                  </select>
                  <select value={rec.monthWeekday} onChange={(e) => onChange({ monthWeekday: Number(e.target.value) })} className={selectClass}>
                    {WEEKDAYS_LONG.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {rec.freq === "year" && (
              <div className="flex items-center gap-2">
                <select value={rec.yearMonth} onChange={(e) => onChange({ yearMonth: Number(e.target.value) })} className={selectClass}>
                  {MONTHS_LONG.map((mo, i) => (
                    <option key={mo} value={i + 1}>{mo}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={rec.monthDay}
                  onChange={(e) => onChange({ monthDay: Math.min(31, Math.max(1, Number(e.target.value))) })}
                  className={cn(selectClass, "w-16")}
                />
              </div>
            )}
          </Token>{" "}
        </>
      )}
      {showTime && (
        <>
          at <Token label={fmtTime(rec.time)}><TimeField value={rec.time} onChange={(time) => onChange({ time })} /></Token>{" "}
        </>
      )}
      <Token label={endLabel(rec)} wide>
        <EndPicker value={rec} onChange={onChange} />
      </Token>
      .
    </div>
  )
}
