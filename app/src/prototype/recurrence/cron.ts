/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * The shared recurrence MODEL that every variant edits, plus its conversion to
 * a 5-field cron string and a "next runs" preview. The whole point of the
 * prototype: four different UIs over this *one* model, so switching variants
 * keeps the schedule and the user compares pure UI.
 *
 * Feasibility is first-class here. Houston's backend stores routines as a
 * 5-field cron string (see ui/routines/src/schedule-cron-utils.ts). Cron is
 * infinite and stateless, so several calendar-style options CANNOT be expressed
 * (every-N-weeks, "2nd Tuesday", end-date / after-N-runs). `toCron` flags those
 * via `cronNative` + `caveats` so the picker can be honest instead of silently
 * lying — matching the repo's no-silent-failure policy.
 */

export type Freq = "minute" | "hour" | "day" | "week" | "month" | "year"
export type MonthMode = "day" | "weekday"
export type EndMode = "never" | "on" | "after"

export interface Recurrence {
  freq: Freq
  /** "every N" — N ≥ 1. */
  interval: number
  /** "HH:MM" local time-of-day for day/week/month/year frequencies. */
  time: string
  /** 0=Sun … 6=Sat. Used when freq = "week". */
  weekdays: number[]
  monthMode: MonthMode
  /** 1–31. Used for month("day") and year. */
  monthDay: number
  /** 1–5, or -1 for "last". Used for month("weekday"). */
  monthOrdinal: number
  /** 0=Sun … 6=Sat. Used for month("weekday"). */
  monthWeekday: number
  /** 1–12. Used when freq = "year". */
  yearMonth: number
  endMode: EndMode
  /** "YYYY-MM-DD". Used when endMode = "on". */
  endDate: string
  /** Used when endMode = "after". */
  endCount: number
}

export const DEFAULT_RECURRENCE: Recurrence = {
  freq: "week",
  interval: 1,
  time: "09:00",
  weekdays: [1, 3, 5], // Mon/Wed/Fri — showcases the new multi-day capability
  monthMode: "day",
  monthDay: 1,
  monthOrdinal: 2,
  monthWeekday: 2,
  yearMonth: 1,
  endMode: "never",
  endDate: "",
  endCount: 10,
}

export interface CronResult {
  /** The 5-field cron the backend would store (best-effort for non-native). */
  cron: string
  /** True when the current scheduler can fire this exactly as drawn. */
  cronNative: boolean
  /** Human notes on anything cron can't honour — shown to the user. */
  caveats: string[]
}

function hm(time: string): { h: number; m: number } {
  const [h, m] = time.split(":").map(Number)
  return { h: h ?? 9, m: m ?? 0 }
}

export function toCron(r: Recurrence): CronResult {
  const { h, m } = hm(r.time)
  const n = Math.max(1, Math.floor(r.interval))
  const caveats: string[] = []
  let cron = ""
  let cronNative = true

  switch (r.freq) {
    case "minute":
      cron = n === 1 ? "* * * * *" : `*/${n} * * * *`
      if (60 % n !== 0) caveats.push("Sub-hour intervals fire cleanly only when they divide 60.")
      break
    case "hour":
      cron = n === 1 ? "0 * * * *" : `0 */${n} * * *`
      if (24 % n !== 0) caveats.push("Hour intervals fire cleanly only when they divide 24.")
      break
    case "day":
      cron = n === 1 ? `${m} ${h} * * *` : `${m} ${h} */${n} * *`
      if (n > 1) caveats.push(`"Every ${n} days" restarts each month (cron */N on day-of-month).`)
      break
    case "week": {
      const days = [...r.weekdays].sort((a, b) => a - b)
      cron = `${m} ${h} * * ${days.length ? days.join(",") : "*"}`
      if (n > 1) {
        cronNative = false
        caveats.push(`"Every ${n} weeks" can't be expressed in cron — needs an anchor date + scheduler support.`)
      }
      break
    }
    case "month":
      if (r.monthMode === "day") {
        cron = `${m} ${h} ${r.monthDay} * *`
        if (n > 1) {
          cronNative = false
          caveats.push(`"Every ${n} months" can't be expressed in cron — needs an anchor date + scheduler support.`)
        }
      } else {
        // "2nd Tuesday" — no POSIX cron operator for ordinal weekday.
        cron = `${m} ${h} * * ${r.monthWeekday}`
        cronNative = false
        caveats.push("“On the Nth weekday” isn’t expressible in standard cron — needs scheduler support (RRULE-style).")
      }
      break
    case "year":
      cron = `${m} ${h} ${r.monthDay} ${r.yearMonth} *`
      if (n > 1) {
        cronNative = false
        caveats.push(`"Every ${n} years" can't be expressed in cron — needs an anchor date + scheduler support.`)
      }
      break
  }

  if (r.endMode !== "never") {
    cronNative = false
    caveats.push(
      r.endMode === "on"
        ? "An end date can't be expressed in cron — the scheduler must stop firing after it."
        : "“After N runs” can't be expressed in cron — the scheduler must count runs and stop.",
    )
  }

  return { cron, cronNative, caveats }
}
