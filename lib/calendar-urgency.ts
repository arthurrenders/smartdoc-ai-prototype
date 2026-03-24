export type UrgencyLevel = "critical" | "warning" | "info" | "neutral"

const URGENCY_RANK: Record<UrgencyLevel, number> = {
  critical: 3,
  warning: 2,
  info: 1,
  neutral: 0,
}

function daysFromTodayUtc(dateOn: string): number {
  const m = dateOn.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return 0
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const t = new Date()
  const utcToday = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
  const utcTarget = Date.UTC(y, mo - 1, d)
  return Math.round((utcTarget - utcToday) / (24 * 60 * 60 * 1000))
}

/**
 * Urgency for a single document_dates row (for styling list items and day cells).
 */
export function urgencyForDocumentDate(dateType: string, dateOn: string): UrgencyLevel {
  const days = daysFromTodayUtc(dateOn)
  const t = dateType.toLowerCase()

  if (t === "expiry") {
    if (days < 0) return "critical"
    if (days <= 30) return "critical"
    if (days <= 90) return "warning"
    return "info"
  }

  if (t === "certificate" || t === "inspection") {
    if (days < 0) return "neutral"
    return "info"
  }

  return "info"
}

export function maxUrgency(levels: UrgencyLevel[]): UrgencyLevel {
  if (levels.length === 0) return "neutral"
  return levels.reduce((best, cur) =>
    URGENCY_RANK[cur] > URGENCY_RANK[best] ? cur : best
  )
}

export function urgencyDayCellClass(level: UrgencyLevel): string {
  switch (level) {
    case "critical":
      return "border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100"
    case "warning":
      return "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100"
    case "info":
      return "border-primary/35 bg-accent/90 text-foreground dark:border-primary/50 dark:bg-accent/30"
    default:
      return "border-[hsl(var(--border))] bg-muted/50 text-muted-foreground"
  }
}

export function urgencyBadgeClass(level: UrgencyLevel): string {
  switch (level) {
    case "critical":
      return "border-red-200/80 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100"
    case "warning":
      return "border-orange-200/80 bg-orange-100 text-orange-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
    case "info":
      return "border-primary/40 bg-accent text-foreground dark:bg-accent/40"
    default:
      return "border-[hsl(var(--border))] bg-muted text-muted-foreground"
  }
}
