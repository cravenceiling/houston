/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * VARIANT D — "type-to-schedule" (Todoist's 2026 model). A natural-language box
 * is the primary affordance; what you type is parsed live and *reflected into
 * the same model the visual picker edits*, so nothing is silent. If the parser
 * can't understand the text it says so (amber inline note) instead of guessing.
 * A "Edit manually" disclosure reveals compact structured controls as the
 * fallback — the NL box accelerates, it never traps.
 */
import { useState } from "react"
import { cn } from "@houston-ai/core"
import { Sparkles, TriangleAlert, Pencil } from "lucide-react"
import type { Freq, Recurrence } from "./cron"
import { summarize } from "./summary"
import { parseNL } from "./parse"
import { NumberStepper, TimeField, EndPicker } from "./controls"
import { WeekdayToggle, WeekdayShortcuts } from "./weekday-toggle"

const SUGGESTIONS = [
  "every weekday at 9am",
  "every Monday and Thursday",
  "every 2 weeks on Mon, Wed",
  "on the 1st of every month",
  "every 3 hours",
  "every morning",
]

const FREQS: Freq[] = ["minute", "hour", "day", "week", "month", "year"]
type Patch = (p: Partial<Recurrence>) => void

export function VariantD({ rec, onChange }: { rec: Recurrence; onChange: Patch }) {
  const [text, setText] = useState("every weekday at 9am")
  const [status, setStatus] = useState<"ok" | "empty" | "error">("ok")
  const [manual, setManual] = useState(false)

  const apply = (value: string) => {
    setText(value)
    if (!value.trim()) return setStatus("empty")
    const { patch, ok } = parseNL(value)
    if (ok) {
      onChange(patch)
      setStatus("ok")
    } else {
      setStatus("error")
    }
  }

  return (
    <div className="space-y-4">
      {/* NL input */}
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border bg-background px-4 py-3 transition-colors",
          status === "error" ? "border-[#e0ac00]/40" : "border-border/25 focus-within:border-primary/40",
        )}
      >
        <Sparkles className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <input
          value={text}
          onChange={(e) => apply(e.target.value)}
          placeholder="Try: every other Monday at 9am"
          className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {/* Reflected interpretation / honest error */}
      {status === "ok" && (
        <p className="px-1 text-sm text-muted-foreground">
          Understood as <span className="font-medium text-foreground">{summarize(rec).replace(/^Runs /, "")}</span>
        </p>
      )}
      {status === "error" && (
        <p className="flex items-center gap-2 px-1 text-sm text-[#b78a00]">
          <TriangleAlert className="size-4" />
          Couldn't read that. Try wording like the suggestions below — or edit manually.
        </p>
      )}

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => apply(s)}
            className="rounded-full border border-border/20 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-border/40"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Manual fallback */}
      <button
        type="button"
        onClick={() => setManual((m) => !m)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <Pencil className="size-3.5" />
        {manual ? "Hide manual editor" : "Prefer to click? Edit manually"}
      </button>

      {manual && (
        <div className="space-y-4 rounded-xl border border-border/15 bg-secondary/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <NumberStepper value={rec.interval} onChange={(interval) => onChange({ interval })} />
            <div className="flex flex-wrap gap-1.5">
              {FREQS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onChange({ freq: f })}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-medium capitalize transition-colors",
                    rec.freq === f ? "bg-primary text-primary-foreground" : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f}
                  {rec.interval > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>
          {rec.freq === "week" && (
            <div className="space-y-2.5">
              <WeekdayToggle value={rec.weekdays} onChange={(weekdays) => onChange({ weekdays })} />
              <WeekdayShortcuts onPick={(weekdays) => onChange({ weekdays })} />
            </div>
          )}
          {rec.freq !== "minute" && rec.freq !== "hour" && (
            <TimeField value={rec.time} onChange={(time) => onChange({ time })} />
          )}
          <EndPicker value={rec} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
