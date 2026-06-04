/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * A pragmatic natural-language → Recurrence parser for Variant D (the Todoist
 * accelerator). Deliberately small: it covers the common phrasings and, when it
 * can't understand the input, returns ok:false so the UI surfaces a visible
 * error instead of silently guessing — matching the repo's no-silent-failure
 * rule. The visual picker remains the source of truth; this only *seeds* it.
 */
import type { Freq, Recurrence } from "./cron"

export interface ParseResult {
  patch: Partial<Recurrence>
  ok: boolean
}

const WEEKDAY_WORDS: [RegExp, number][] = [
  [/\bsun(day)?\b/, 0],
  [/\bmon(day)?\b/, 1],
  [/\btue(s|sday)?\b/, 2],
  [/\bwed(nesday)?\b/, 3],
  [/\bthu(r|rs|rsday)?\b/, 4],
  [/\bfri(day)?\b/, 5],
  [/\bsat(urday)?\b/, 6],
]

const MONTH_WORDS = [
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
]

const UNIT_TO_FREQ: Record<string, Freq> = {
  minute: "minute",
  min: "minute",
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
}

function parseTime(t: string): string | null {
  if (/\b(every )?morning\b/.test(t)) return "09:00"
  if (/\b(every )?afternoon\b/.test(t)) return "12:00"
  if (/\b(every )?evening\b/.test(t)) return "19:00"
  if (/\b(every )?night\b/.test(t)) return "22:00"
  if (/\bnoon\b/.test(t)) return "12:00"
  if (/\bmidnight\b/.test(t)) return "00:00"
  const m = t.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const ap = m[3]
  if (ap === "pm" && h < 12) h += 12
  if (ap === "am" && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

/** Parse free text into a Recurrence patch. ok=false ⇒ nothing understood. */
export function parseNL(input: string): ParseResult {
  const t = input.toLowerCase().trim()
  if (!t) return { patch: {}, ok: false }

  const patch: Partial<Recurrence> = {}
  let understood = false

  // Time of day
  const time = parseTime(t)
  if (time) {
    patch.time = time
    understood = true
  }

  // Interval: "every other X" = 2; "every N units"
  if (/\bevery other\b/.test(t)) patch.interval = 2
  const everyN = t.match(/\bevery (\d+)\s*(minute|min|hour|day|week|month|year)s?\b/)
  if (everyN) {
    patch.interval = Number(everyN[1])
    patch.freq = UNIT_TO_FREQ[everyN[2]]
    understood = true
  }

  // Weekday names → weekly
  const days = WEEKDAY_WORDS.filter(([re]) => re.test(t)).map(([, d]) => d)
  if (/\bweekdays?\b/.test(t) && !days.length) {
    patch.freq = "week"
    patch.weekdays = [1, 2, 3, 4, 5]
    patch.interval ??= 1
    understood = true
  } else if (/\bweekends?\b/.test(t)) {
    patch.freq = "week"
    patch.weekdays = [0, 6]
    patch.interval ??= 1
    understood = true
  } else if (days.length) {
    patch.freq = "week"
    patch.weekdays = [...new Set(days)].sort((a, b) => a - b)
    patch.interval ??= 1
    understood = true
  }

  // Frequency keywords
  if (/\b(daily|every day)\b/.test(t)) { patch.freq = "day"; patch.interval ??= 1; understood = true }
  if (/\bhourly\b/.test(t)) { patch.freq = "hour"; patch.interval ??= 1; understood = true }
  if (/\b(weekly|every week)\b/.test(t) && !days.length) { patch.freq = "week"; patch.interval ??= 1; understood = true }
  if (/\b(monthly|every month)\b/.test(t)) { patch.freq = "month"; patch.monthMode = "day"; patch.interval ??= 1; understood = true }
  if (/\b(yearly|annually|every year)\b/.test(t)) { patch.freq = "year"; patch.interval ??= 1; understood = true }

  // "on the 15th"
  const dom = t.match(/\bon the (\d{1,2})(?:st|nd|rd|th)?\b/)
  if (dom) {
    const d = Number(dom[1])
    if (d >= 1 && d <= 31) {
      patch.monthDay = d
      if (patch.freq !== "year") { patch.freq = "month"; patch.monthMode = "day" }
      patch.interval ??= 1
      understood = true
    }
  }

  // "jan 27" → yearly
  const monthDay = t.match(new RegExp(`\\b(${MONTH_WORDS.join("|")})[a-z]*\\.? (\\d{1,2})\\b`))
  if (monthDay) {
    patch.freq = "year"
    patch.yearMonth = MONTH_WORDS.indexOf(monthDay[1]) + 1
    patch.monthDay = Number(monthDay[2])
    patch.interval ??= 1
    understood = true
  }

  // End: "for N times"
  const forN = t.match(/\bfor (\d+) (?:times|runs)\b/)
  if (forN) {
    patch.endMode = "after"
    patch.endCount = Number(forN[1])
    understood = true
  }

  return { patch, ok: understood }
}
