
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
 * Visible doc types that should be treated as upload-only. Kept as an extension
 * point, but all visible required document types currently support analysis.
 */
export const NON_ANALYZED_DOCUMENT_TYPE_NAMES: readonly string[] = []

/** Minimal shape from an analysis result for status/expiry. Compatible with AnalysisResult. */
export type DocumentAnalysisSummary = {
  status?: "red" | "orange" | "green"
  expiry_date?: string | null
}

/** Latest analysis_runs.status for a document — drives the "pending" UI state. */
export type AnalysisRunStatus = "queued" | "processing" | "done" | "error"

/** One document's type and its latest analysis summary (for property aggregation). */
export type DocumentWithAnalysis = {
  documentTypeId: string
  documentTypeName?: string | null
  analysis?: DocumentAnalysisSummary | null
  /**
   * Latest `analysis_runs.status`. When this is anything other than `"done"` (or omitted), the
   * document is treated as **not yet analyzed** — never green, never counted as compliant.
   */
  analysisRunStatus?: AnalysisRunStatus | null
}

/** Aggregate property status. `pending` = uploads exist but the realtor has not run analysis yet. */
export type PropertyStatusValue = "green" | "orange" | "red" | "pending"

/** Result of computing overall property status and counts. */
export type PropertyStatusResult = {
  status: PropertyStatusValue
  missingCount: number
  expiriesCount: number
  documentCount: number
  /** Required documents present but not yet successfully analyzed (queued/processing/error). */
  pendingCount: number
}

const UPCOMING_DAYS = 90
const NON_ANALYZED_DOCUMENT_TYPE_NAME_SET = new Set<string>(NON_ANALYZED_DOCUMENT_TYPE_NAMES)

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

function isUploadOnlyDocument(doc: DocumentWithAnalysis): boolean {
  return Boolean(
    doc.documentTypeName &&
      NON_ANALYZED_DOCUMENT_TYPE_NAME_SET.has(doc.documentTypeName)
  )
}

export function getEffectiveDocumentStatus(
  doc: DocumentWithAnalysis
): DocumentAnalysisSummary["status"] {
  if (doc.analysisRunStatus === "done") return doc.analysis?.status
  if (isUploadOnlyDocument(doc)) return doc.analysis?.status ?? "green"
  return undefined
}

/**
 * Computes overall property status and counts from required document types and
 * the documents (with their latest analysis) for that property.
 *
 * Rules (most severe wins):
 * - **red**: any analyzed document is `red` OR all required documents are missing
 * - **orange**: any analyzed document is `orange`, any expiring soon, or some (but not all) required
 *   documents missing
 * - **pending**: uploads exist for analyzed required types but at least one has no completed analysis yet
 *   (queued/processing/error). Upload-only types count as green once present.
 * - **green**: all required documents present, all analyzed types are `done`, all effectively `green`
 */
export function computePropertyStatus(
  requiredTypeIds: string[],
  documentsWithAnalysis: DocumentWithAnalysis[]
): PropertyStatusResult {
  const requiredSet = new Set(requiredTypeIds)
  type Bucket = DocumentWithAnalysis
  const byType = new Map<string, Bucket>()
  let expiriesCount = 0

  for (const doc of documentsWithAnalysis) {
    const summary = doc.analysis || {}
    byType.set(doc.documentTypeId, doc)
    const expiry = parseExpiry(summary.expiry_date)
    if (isUpcoming(expiry)) expiriesCount++
  }

  const missingCount = requiredTypeIds.filter((id) => !byType.has(id)).length
  const documentCount = documentsWithAnalysis.length

  let hasRed = false
  let hasOrange = false
  let hasGreen = false
  let pendingCount = 0
  let analyzedCount = 0

  for (const [typeId, bucket] of byType) {
    const isRequired = requiredSet.has(typeId)
    const status = getEffectiveDocumentStatus(bucket)
    const analyzed = Boolean(status)

    if (status === "red") hasRed = true
    else if (status === "orange") hasOrange = true
    else if (status === "green") hasGreen = true

    if (analyzed && status) {
      analyzedCount++
    } else if (isRequired) {
      pendingCount++
    }
  }

  let status: PropertyStatusValue
  if (missingCount >= requiredTypeIds.length && requiredTypeIds.length > 0) {
    status = "red"
  } else if (hasRed) {
    status = "red"
  } else if (hasOrange || missingCount > 0 || expiriesCount > 0) {
    status = "orange"
  } else if (pendingCount > 0) {
    status = "pending"
  } else if (analyzedCount > 0 && hasGreen) {
    status = "green"
  } else {
    // No required documents configured AND nothing uploaded — neutral pending state.
    status = "pending"
  }

  return {
    status,
    missingCount,
    expiriesCount,
    documentCount,
    pendingCount,
  }
}

/**
 * Extracts a DocumentAnalysisSummary from an analysis result (e.g. AnalysisResult or result_json from DB).
 */
export function toDocumentAnalysisSummary(
  result: { status?: string; expiry_date?: string | null; summary?: string | null } | null | undefined
): DocumentAnalysisSummary {
  if (!result) return {}
  const status =
    result.status === "red" || result.status === "orange" || result.status === "green"
      ? result.status
      : undefined
  const summaryExpiry =
    typeof result.summary === "string"
      ? result.summary.match(/expiry date:\s*([^\n|]+)/i)?.[1]?.trim() ?? null
      : null
  return {
    ...(status ? { status } : {}),
    expiry_date: result.expiry_date ?? summaryExpiry ?? null,
  }
}
