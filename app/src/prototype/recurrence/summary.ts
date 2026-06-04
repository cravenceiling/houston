/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * `summarize` turns the structured Recurrence into the plain-English sentence a
 * non-technical user reads ("Runs every week on Mon, Wed and Fri at 9:00 AM").
 * Every variant shows this somewhere — it's the single best trust mechanism
 * (per the research) and it keeps cron syntax entirely out of the user's view.
 */
import type { Recurrence } from "./cron"
import {
  WEEKDAYS_SHORT,
  WEEKDAYS_LONG,
  MONTHS_LONG,
  fmtTime,
  fmtDate,
  ordinalNum,
  ordinalWord,
  joinList,
} from "./format"

const WEEKDAY_SET = (days: number[]) => [...days].sort((a, b) => a - b).join(",")

/** Friendly name for a weekday set, falling back to the day list. */
function weekdayPhrase(days: number[]): string {
  if (!days.length) return "(no days selected)"
  const set = WEEKDAY_SET(days)
  if (set === "1,2,3,4,5") return "every weekday"
  if (set === "0,6") return "every weekend day"
  if (set === "0,1,2,3,4,5,6") return "every day"
  return "on " + joinList([...days].sort((a, b) => a - b).map((d) => WEEKDAYS_SHORT[d]))
}

function everyN(n: number, unit: string): string {
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`
}

function endPhrase(r: Recurrence): string {
  if (r.endMode === "on" && r.endDate) return `, until ${fmtDate(new Date(`${r.endDate}T00:00`))}`
  if (r.endMode === "after") return `, ${r.endCount} time${r.endCount === 1 ? "" : "s"}`
  return ""
}

export function summarize(r: Recurrence): string {
  return coreSummary(r) + endPhrase(r)
}

// Return from each case (no default) so the exhaustive Freq union compiles
// without a definite-assignment dance — same pattern as presetSummary in
// ui/routines/src/schedule-cron-utils.ts.
function coreSummary(r: Recurrence): string {
  const t = fmtTime(r.time)
  const n = Math.max(1, r.interval)

  switch (r.freq) {
    case "minute":
      return n === 1 ? "Runs every minute" : `Runs every ${n} minutes`
    case "hour":
      return n === 1 ? "Runs every hour" : `Runs every ${n} hours`
    case "day":
      return `Runs ${everyN(n, "day")} at ${t}`
    case "week": {
      const phrase = weekdayPhrase(r.weekdays)
      // "every weekday" already carries the cadence; otherwise prepend "every week".
      const lead = phrase.startsWith("every") ? `Runs ${phrase}` : `Runs ${everyN(n, "week")} ${phrase}`
      return `${lead} at ${t}`
    }
    case "month":
      return r.monthMode === "day"
        ? `Runs on the ${ordinalNum(r.monthDay)} of ${everyN(n, "month")} at ${t}`
        : `Runs on the ${ordinalWord(r.monthOrdinal)} ${WEEKDAYS_LONG[r.monthWeekday]} of ${everyN(n, "month")} at ${t}`
    case "year":
      return `Runs ${everyN(n, "year")} on ${MONTHS_LONG[r.yearMonth - 1]} ${r.monthDay} at ${t}`
  }
}
