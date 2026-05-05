export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function isoFromYmd(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`
}

export function formatTimeRange(start: string, end: string): string {
  const sm = start.match(/T(\d{2}:\d{2})/)
  const em = end.match(/T(\d{2}:\d{2})/)
  if (!sm || !em) return ""
  return `${sm[1]} – ${em[1]}`
}

export function formatDateNl(iso: string, opts?: { long?: boolean }): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (opts?.long) {
    return date.toLocaleDateString("nl-BE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
  }
  return date.toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

export function formatDateTimeNl(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("nl-BE", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}
