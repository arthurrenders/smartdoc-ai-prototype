/** date_type values we generate in-app reminders for (matches document_dates usage). */
export const NOTIFICATION_DATE_TYPES = [
  "expiry",
  "certificate",
  "inspection",
  "follow_up",
  "remediation_deadline",
] as const

export type NotificationDateType = (typeof NOTIFICATION_DATE_TYPES)[number]

export function isSupportedNotificationDateType(dateType: string): boolean {
  const t = dateType.toLowerCase().trim()
  return (NOTIFICATION_DATE_TYPES as readonly string[]).includes(t)
}

/** rule.date_types null => all supported; else intersection. */
export function ruleAppliesToDateType(
  ruleDateTypes: string[] | null | undefined,
  documentDateType: string
): boolean {
  if (!isSupportedNotificationDateType(documentDateType)) return false
  const t = documentDateType.toLowerCase().trim()
  if (!ruleDateTypes || ruleDateTypes.length === 0) return true
  return ruleDateTypes.map((x) => x.toLowerCase().trim()).includes(t)
}
