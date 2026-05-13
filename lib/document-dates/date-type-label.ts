/**
 * Human-friendly labels for document_dates.date_type (storage + display).
 */
const LABEL_BY_TYPE: Record<string, string> = {
  certificate: "Attestdatum",
  expiry: "Vervaldatum",
  inspection: "Keuringsdatum",
  follow_up: "Opvolgdatum",
  remediation_deadline: "Saneringsdeadline",
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
