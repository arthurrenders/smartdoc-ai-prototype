/**
 * Property-level flag aggregation: deduplicate, suppress noisy flags,
 * apply wrong-document-type override, and sort by importance.
 */

export type FlagInput = {
  severity: "red" | "orange" | "green"
  title: string
  details: string
}

export type FlagOutput = {
  severity: "red" | "orange" | "green"
  title: string
  details: string
  documentTypeName?: string
  /** When > 1, this flag was merged from multiple documents. */
  occurrenceCount?: number
}

export type DocumentFlagsInput = {
  documentTypeName: string
  documentId?: string
  flags: FlagInput[]
}

const TITLE_WRONG_DOCUMENT_TYPE = "wrong document type"
const TITLE_MANUAL_REVIEW = "manual review required"

function isWrongDocumentTypeFlag(flag: FlagInput): boolean {
  const t = (flag.title || "").toLowerCase()
  const d = (flag.details || "").toLowerCase()
  return t.includes(TITLE_WRONG_DOCUMENT_TYPE) || d.includes("wrong document")
}

function isManualReviewFlag(flag: FlagInput): boolean {
  const t = (flag.title || "").toLowerCase()
  const d = (flag.details || "").toLowerCase()
  return t.includes(TITLE_MANUAL_REVIEW) || d.includes(TITLE_MANUAL_REVIEW)
}

function isSpecificFlag(flag: FlagInput): boolean {
  const t = (flag.title || "").toLowerCase()
  return (
    isWrongDocumentTypeFlag(flag) ||
    t.includes("expired") ||
    t.includes("invalid") ||
    t.includes("non-compliant") ||
    t.includes("wrong document") ||
    t.includes("high-risk") ||
    t.includes("high risk") ||
    t.includes("poor energy") ||
    t.includes("moderate energy") ||
    t.includes("missing") ||
    t.includes("asbestos") && (t.includes("risk") || t.includes("expired") || t.includes("inventory"))
  )
}

/**
 * For a single document: if it has a wrong-document-type flag, return only that flag.
 * Otherwise apply suppression: drop "Manual review required" if the document has any more specific flag.
 */
function normalizeDocumentFlags(flags: FlagInput[]): FlagInput[] {
  const wrongTypeIndex = flags.findIndex(isWrongDocumentTypeFlag)
  if (wrongTypeIndex >= 0) {
    return [flags[wrongTypeIndex]]
  }
  const hasSpecific = flags.some(isSpecificFlag)
  if (hasSpecific) {
    return flags.filter((f) => !isManualReviewFlag(f))
  }
  return flags
}

function severityOrder(severity: "red" | "orange" | "green"): number {
  switch (severity) {
    case "red":
      return 0
    case "orange":
      return 1
    case "green":
      return 2
    default:
      return 1
  }
}

function documentTypeOrder(name: string | undefined): number {
  if (!name) return 3
  const n = name.toUpperCase()
  if (n === "EPC") return 0
  if (n === "ASBESTOS") return 1
  if (n === "ELECTRICAL") return 2
  return 3
}

/**
 * Dedupe key: same title + document type + details => same logical flag.
 */
function dedupeKey(flag: FlagOutput): string {
  const title = (flag.title || "").trim().toLowerCase()
  const doc = (flag.documentTypeName || "").trim().toLowerCase()
  const details = (flag.details || "").trim().toLowerCase()
  return `${title}|${doc}|${details}`
}

/**
 * Aggregate per-document flags into a clean property-level list.
 * - Wrong document type: only that flag is shown for that document; other flags from that document are hidden.
 * - Manual review required: suppressed when the same document has a more specific flag.
 * - Deduplicate: same title + document type + details shown once with optional occurrence count.
 * - Sort: red first, then orange, then green; within same severity, by document type (EPC, ASBESTOS, ELECTRICAL).
 */
export function aggregatePropertyFlags(documents: DocumentFlagsInput[]): FlagOutput[] {
  const normalizedPerDoc: Array<{ documentTypeName: string; flags: FlagInput[] }> = documents.map(
    (doc) => ({
      documentTypeName: doc.documentTypeName,
      flags: normalizeDocumentFlags(doc.flags),
    })
  )

  const withDocType: FlagOutput[] = []
  for (const { documentTypeName, flags } of normalizedPerDoc) {
    for (const f of flags) {
      withDocType.push({
        severity: f.severity,
        title: f.title,
        details: f.details,
        documentTypeName,
      })
    }
  }

  const byKey = new Map<string, FlagOutput>()
  for (const flag of withDocType) {
    const key = dedupeKey(flag)
    const existing = byKey.get(key)
    if (existing) {
      existing.occurrenceCount = (existing.occurrenceCount ?? 1) + 1
    } else {
      byKey.set(key, { ...flag, occurrenceCount: 1 })
    }
  }

  const aggregated = Array.from(byKey.values())
  aggregated.sort((a, b) => {
    const sev = severityOrder(a.severity) - severityOrder(b.severity)
    if (sev !== 0) return sev
    return documentTypeOrder(a.documentTypeName) - documentTypeOrder(b.documentTypeName)
  })

  return aggregated
}
