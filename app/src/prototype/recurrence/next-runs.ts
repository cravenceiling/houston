/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Illustrative "next N runs" preview — mirrors crontab.guru's trust-building
 * list. Day-granular for day/week/month/year; arithmetic for minute/hour.
 * Interval > 1 on weeks/months is approximated (it isn't cron-native anyway and
 * the UI flags that). Good enough to make the schedule legible — not a stand-in
 * for the engine's own next-fire computation (ui/routines/src/next-fire.ts).
 */
import type { Recurrence } from "./cron"

/** Is the Nth (monthOrdinal) `weekday` of `date`'s month equal to `date`? */
function matchesOrdinalWeekday(date: Date, ordinal: number, weekday: number): boolean {
  if (date.getDay() !== weekday) return false
  if (ordinal === -1) {
    const next = new Date(date)
    next.setDate(date.getDate() + 7)
    return next.getMonth() !== date.getMonth() // no same weekday left this month
  }
  return Math.floor((date.getDate() - 1) / 7) + 1 === ordinal
}

/** Does this calendar day fire, per the structured model (day-granular)? */
function matchesDay(date: Date, r: Recurrence): boolean {
  switch (r.freq) {
    case "day":
      return (date.getDate() - 1) % Math.max(1, r.interval) === 0
    case "week":
      return r.weekdays.includes(date.getDay())
    case "month":
      return r.monthMode === "day"
        ? date.getDate() === r.monthDay
        : matchesOrdinalWeekday(date, r.monthOrdinal, r.monthWeekday)
    case "year":
      return date.getMonth() + 1 === r.yearMonth && date.getDate() === r.monthDay
    default:
      return false
  }
}

export function nextRuns(r: Recurrence, count = 3, from: Date = new Date()): Date[] {
  const out: Date[] = []
  const endBy = r.endMode === "on" && r.endDate ? new Date(`${r.endDate}T23:59`) : null

  if (r.freq === "minute" || r.freq === "hour") {
    const step = r.freq === "minute" ? Math.max(1, r.interval) : Math.max(1, r.interval) * 60
    let t = new Date(from)
    t.setSeconds(0, 0)
    t = new Date(t.getTime() + 60_000)
    for (let i = 0; i < 60 * 24 * 2 && out.length < count; i++) {
      const minsOfDay = t.getHours() * 60 + t.getMinutes()
      const ok = r.freq === "hour" ? t.getMinutes() === 0 && minsOfDay % step === 0 : minsOfDay % step === 0
      if (ok && (!endBy || t <= endBy)) out.push(new Date(t))
      t = new Date(t.getTime() + 60_000)
    }
    return out
  }

  const [h, m] = r.time.split(":").map(Number)
  for (let i = 0; i < 366 * 5 && out.length < count; i++) {
    const cand = new Date(from)
    cand.setHours(h ?? 9, m ?? 0, 0, 0)
    cand.setDate(cand.getDate() + i)
    if (cand <= from) continue
    if (endBy && cand > endBy) break
    if (matchesDay(cand, r)) out.push(cand)
  }
  return out
}
