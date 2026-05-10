
/**
 * Required document type names for property compliance.
 * Used to derive which document types must be present and okay for a property to be "green".
 * Add or remove names here to change requirements (ids are resolved at runtime from DB).
 */
export const REQUIRED_DOCUMENT_TYPE_NAMES = [
  "EPC",
  "ASBESTOS",
  "ELECTRICAL",
  "SOIL_CERTIFICATE",
  "URBAN_PLANNING_INFO",
] as const

export type RequiredDocumentTypeName = (typeof REQUIRED_DOCUMENT_TYPE_NAMES)[number]

/**
 * Doc types shown as upload slots in the per-property DocumentTable.
 * Order is preserved in the rendered table.
 * Add a name here to surface a new upload row; remove to hide it.
 */
export const VISIBLE_DOCUMENT_TYPE_NAMES = [
  "EPC",
  "ASBESTOS",
  "ELECTRICAL",
  "SOIL_CERTIFICATE",
  "URBAN_PLANNING_INFO",
] as const

/**
 * Visible doc types that we don't run AI analysis on — UI shows a
 * "Geen automatische analyse" hint and the analysis pipeline writes a
 * benign Dutch green result instead of calling Gemini.
 */
export const NON_ANALYZED_DOCUMENT_TYPE_NAMES = [
  "SOIL_CERTIFICATE",
  "URBAN_PLANNING_INFO",
] as const

/** Minimal shape from an analysis result for status/expiry. Compatible with AnalysisResult. */
export type DocumentAnalysisSummary = {
  status?: "red" | "orange" | "green"
  expiry_date?: string | null
}

/** One document's type and its latest analysis summary (for property aggregation). */
export type DocumentWithAnalysis = {
  documentTypeId: string
  analysis?: DocumentAnalysisSummary | null
}

/** Result of computing overall property status and counts. */
export type PropertyStatusResult = {
  status: "green" | "orange" | "red"
  missingCount: number
  expiriesCount: number
  documentCount: number
}

const UPCOMING_DAYS = 90

function parseExpiry(expiry: string | null | undefined): Date | null {
  if (!expiry || typeof expiry !== "string") return null
  const d = new Date(expiry)
  return isNaN(d.getTime()) ? null : d
}

function isUpcoming(expiryDate: Date | null): boolean {
  if (!expiryDate) return false
  const now = new Date()
  const limit = new Date(now)
  limit.setDate(limit.getDate() + UPCOMING_DAYS)
  return expiryDate >= now && expiryDate <= limit
}

/**
 * Computes overall property status and counts from required document types and
 * the documents (with their latest analysis) for that property.
 *
 * Rules:
 * - green: all required documents present and all analysis statuses are "green"
 * - orange: some documents present/okay, but there are missing documents,
 *   warnings (orange), or upcoming expiries
 * - red: all required documents missing OR any critical (red) analysis status
 */
export function computePropertyStatus(
  requiredTypeIds: string[],
  documentsWithAnalysis: DocumentWithAnalysis[]
): PropertyStatusResult {
  const byType = new Map<string, DocumentAnalysisSummary>()
  let expiriesCount = 0

  for (const doc of documentsWithAnalysis) {
    const summary = doc.analysis || {}
    byType.set(doc.documentTypeId, summary)
    const expiry = parseExpiry(summary.expiry_date)
    if (isUpcoming(expiry)) expiriesCount++
  }

  const missingCount = requiredTypeIds.filter((id) => !byType.has(id)).length
  const documentCount = documentsWithAnalysis.length

  const hasRed = [...byType.values()].some((r) => r.status === "red")
  const hasOrange = [...byType.values()].some((r) => r.status === "orange")
  const allRequiredPresent = missingCount === 0
  const allGreen =
    allRequiredPresent &&
    byType.size > 0 &&
    [...byType.values()].every((r) => r.status === "green")

  let status: "green" | "orange" | "red" = "green"
  if (missingCount >= requiredTypeIds.length || hasRed) {
    status = "red"
  } else if (missingCount > 0 || hasOrange || expiriesCount > 0) {
    status = "orange"
  } else if (allGreen) {
    status = "green"
  }

  return {
    status,
    missingCount,
    expiriesCount,
    documentCount,
  }
}

/**
 * Extracts a DocumentAnalysisSummary from an analysis result (e.g. AnalysisResult or result_json from DB).
 */
export function toDocumentAnalysisSummary(
  result: { status?: string; expiry_date?: string | null } | null | undefined
): DocumentAnalysisSummary {
  if (!result) return {}
  const status =
    result.status === "red" || result.status === "orange" || result.status === "green"
      ? result.status
      : undefined
  return {
    ...(status ? { status } : {}),
    expiry_date: result.expiry_date ?? null,
  }
}
