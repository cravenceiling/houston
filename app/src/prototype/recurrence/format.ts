/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Plain formatting helpers shared by all four recurrence-picker variants:
 * weekday / month names, time + date formatting, list joining. No recurrence
 * logic lives here — see cron.ts (model) and summary.ts (human sentence).
 */

export const WEEKDAYS_MIN = ["S", "M", "T", "W", "T", "F", "S"] as const
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
export const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const

export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

export const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const

/** "first" / "second" / … / "last" — for "the second Tuesday" phrasing. */
export function ordinalWord(n: number): string {
  if (n === -1) return "last"
  return ["", "first", "second", "third", "fourth", "fifth"][n] ?? `${n}th`
}

/** 1 → "1st", 2 → "2nd", 15 → "15th" — for "the 15th of every month". */
export function ordinalNum(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** "09:00" → "9:00 AM". */
export function fmtTime(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const hour = h ?? 9
  const ampm = hour >= 12 ? "PM" : "AM"
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`
}

/** Date → "Aug 3, 2026". */
export function fmtDate(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** Date → "Mon, Aug 3 · 9:00 AM" — for the next-run preview rows. */
export function fmtDateTime(d: Date): string {
  const h = d.getHours()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  const time = `${h12}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()} · ${time}`
}

/** ["Mon","Wed","Fri"] → "Mon, Wed and Fri". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}
