/**
 * Human-friendly labels for document_dates.date_type (storage + display).
 */
const LABEL_BY_TYPE: Record<string, string> = {
  certificate: "Certificate date",
  expiry: "Expiry date",
  inspection: "Inspection date",
  follow_up: "Follow-up date",
  remediation_deadline: "Remediation deadline",
}

export function labelForDocumentDateType(dateType: string): string {
  const key = dateType.toLowerCase().trim()
  if (LABEL_BY_TYPE[key]) return LABEL_BY_TYPE[key]
  return key
    .split(/_+/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}
