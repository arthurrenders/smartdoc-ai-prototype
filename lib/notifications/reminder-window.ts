/**
 * Calendar-day math for "show notification between first_show and last_show (inclusive)".
 * Deadline strings are civil dates (YYYY-MM-DD). "Today" for eligibility should use the same
 * convention (see calendarTodayIsoInTimeZone), not necessarily UTC midnight.
 */

export function utcTodayIso(): string {
  const t = new Date()
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

/**
 * Civil calendar date (YYYY-MM-DD) in an IANA timezone.
 * Use for comparing with document_dates.date_on — not UTC midnight, which can be "yesterday" UTC
 * while the user is already on the next local calendar day.
 */
export function calendarTodayIsoInTimeZone(timeZone: string): string {
  try {
    const s = new Date().toLocaleDateString("sv-SE", { timeZone })
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  } catch {
    /* invalid TZ */
  }
  return utcTodayIso()
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function addUtcDays(isoDate: string, deltaDays: number): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return isoDate
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

/** First calendar day the reminder may appear (deadline minus offset). */
export function firstShowDate(deadlineIso: string, offsetDaysBefore: number): string {
  return addUtcDays(deadlineIso, -offsetDaysBefore)
}

/** Last calendar day we keep surfacing the reminder (grace after deadline). */
export function lastShowDate(deadlineIso: string, graceDaysAfter: number): string {
  return addUtcDays(deadlineIso, graceDaysAfter)
}

export function isoDateCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Inclusive window: today is firstShow <= today <= lastShow */
export function isInNotificationWindow(
  todayIso: string,
  deadlineIso: string,
  offsetDaysBefore: number,
  graceDaysAfter: number
): boolean {
  const first = firstShowDate(deadlineIso, offsetDaysBefore)
  const last = lastShowDate(deadlineIso, graceDaysAfter)
  return isoDateCompare(todayIso, first) >= 0 && isoDateCompare(todayIso, last) <= 0
}
