import type { PropertyExportContext } from "../types"

export type EpcSummary = {
  label: string | null
  kwh_m2_year: number | null
  certificate_date: string | null
  expiry_date: string | null
  is_expired: boolean | null
}

/**
 * Pulls the most recent EPC analysis result from the property documents.
 * Returns null if no EPC document exists or none has been analyzed yet.
 */
export function extractEpcSummary(ctx: PropertyExportContext): EpcSummary | null {
  const epcDocs = ctx.documents.filter(
    (d) => d.document_type_name?.toUpperCase() === "EPC" && d.analysis_result,
  )
  if (epcDocs.length === 0) return null

  const result = epcDocs[0].analysis_result as Record<string, unknown>
  return {
    label: typeof result.epc_score_letter === "string" ? result.epc_score_letter : null,
    kwh_m2_year:
      typeof result.energy_consumption_kwh_m2_year === "number"
        ? result.energy_consumption_kwh_m2_year
        : null,
    certificate_date: typeof result.certificate_date === "string" ? result.certificate_date : null,
    expiry_date: typeof result.expiry_date === "string" ? result.expiry_date : null,
    is_expired: typeof result.is_expired === "boolean" ? result.is_expired : null,
  }
}

export function mapValue(map: Record<string, string> | undefined, key: string | null | undefined): string {
  if (!key || !map) return ""
  return map[key] ?? ""
}
