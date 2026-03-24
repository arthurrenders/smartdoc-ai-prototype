/**
 * Normalize user/LLM date strings to ISO calendar date YYYY-MM-DD, or null if unusable.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function normalizeToIsoDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  // YYYY-MM-DD (optional trailing time / noise)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (isValidYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (common in BE/NL)
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = Number(m[3])
    if (isValidYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  // Last resort: Date.parse (English month names, ISO with time, etc.)
  const t = Date.parse(s)
  if (!Number.isNaN(t)) {
    const dt = new Date(t)
    const y = dt.getUTCFullYear()
    const mo = dt.getUTCMonth() + 1
    const d = dt.getUTCDate()
    if (y >= 1900 && y <= 2100) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  return null
}
