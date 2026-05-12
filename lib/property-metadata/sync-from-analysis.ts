import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AnalysisResult } from "@/lib/analysis/detectors"

const HEATING_VALUES = new Set(["gas", "oil", "electric", "heat_pump", "district", "other"])
const PROPERTY_TYPE_VALUES = new Set(["house", "apartment", "land", "commercial", "other"])

function isWrongDocumentTypeResult(result: AnalysisResult): boolean {
  if (result.summary?.toLowerCase().includes("wrong document type")) return true
  if (
    Array.isArray(result.flags) &&
    result.flags.some((f) => f.title.toLowerCase().includes("wrong document type"))
  ) {
    return true
  }
  return false
}

type Candidate = {
  construction_year: number | null
  heating_type: string | null
  property_type: string | null
  living_area_m2: number | null
}

function extractCandidates(
  documentTypeName: string | null,
  result: AnalysisResult,
): Candidate {
  const r = result as AnalysisResult & {
    construction_year?: unknown
    heating_type?: unknown
    dwelling_type?: unknown
    living_area_m2?: unknown
  }

  const yearRaw = r.construction_year
  const construction_year =
    typeof yearRaw === "number" && Number.isFinite(yearRaw) && yearRaw >= 1700 && yearRaw <= 2100
      ? Math.round(yearRaw)
      : null

  const heating =
    typeof r.heating_type === "string" && HEATING_VALUES.has(r.heating_type)
      ? r.heating_type
      : null

  // EPC analyzer exposes "dwelling_type" which maps onto the property_type column
  const dwelling =
    typeof r.dwelling_type === "string" && PROPERTY_TYPE_VALUES.has(r.dwelling_type)
      ? r.dwelling_type
      : null

  const areaRaw = r.living_area_m2
  const living_area_m2 =
    typeof areaRaw === "number" && Number.isFinite(areaRaw) && areaRaw > 0 && areaRaw < 100_000
      ? areaRaw
      : null

  // Asbestos only carries construction_year; explicitly null the rest.
  if (documentTypeName?.toUpperCase() === "ASBESTOS") {
    return {
      construction_year,
      heating_type: null,
      property_type: null,
      living_area_m2: null,
    }
  }

  return {
    construction_year,
    heating_type: heating,
    property_type: dwelling,
    living_area_m2,
  }
}

/**
 * After a successful analysis run: fill any NULL property metadata columns from
 * values extracted by the analyzer. Existing (manually entered or previously
 * filled) values are NEVER overwritten. For each field actually patched, the
 * source is recorded in `properties.metadata_sources` as "document".
 *
 * Mirrors `lib/property-address/sync-from-analysis.ts` — soft-fail on errors.
 */
export async function syncPropertyMetadataFromAnalysis(
  supabase: SupabaseClient,
  params: { propertyId: string; documentTypeName: string | null; result: AnalysisResult },
): Promise<void> {
  const { propertyId, documentTypeName, result } = params

  if (isWrongDocumentTypeResult(result)) return

  const candidate = extractCandidates(documentTypeName, result)
  if (
    candidate.construction_year === null &&
    candidate.heating_type === null &&
    candidate.property_type === null &&
    candidate.living_area_m2 === null
  ) {
    return
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("properties")
    .select("construction_year, heating_type, property_type, living_area_m2, metadata_sources")
    .eq("id", propertyId)
    .maybeSingle()

  if (fetchErr) {
    console.error("syncPropertyMetadata: fetch property", fetchErr.message)
    return
  }
  if (!existing) return

  const existingTyped = existing as {
    construction_year: number | null
    heating_type: string | null
    property_type: string | null
    living_area_m2: number | null
    metadata_sources: Record<string, "document" | "manual"> | null
  }

  const patch: Record<string, unknown> = {}
  const nextSources: Record<string, "document" | "manual"> = {
    ...(existingTyped.metadata_sources ?? {}),
  }

  if (existingTyped.construction_year === null && candidate.construction_year !== null) {
    patch.construction_year = candidate.construction_year
    nextSources.construction_year = "document"
  }
  if (existingTyped.heating_type === null && candidate.heating_type !== null) {
    patch.heating_type = candidate.heating_type
    nextSources.heating_type = "document"
  }
  if (existingTyped.property_type === null && candidate.property_type !== null) {
    patch.property_type = candidate.property_type
    nextSources.property_type = "document"
  }
  if (existingTyped.living_area_m2 === null && candidate.living_area_m2 !== null) {
    patch.living_area_m2 = candidate.living_area_m2
    nextSources.living_area_m2 = "document"
  }

  if (Object.keys(patch).length === 0) return

  patch.metadata_sources = nextSources
  patch.updated_at = new Date().toISOString()

  const { error: updateErr } = await supabase.from("properties").update(patch).eq("id", propertyId)
  if (updateErr) {
    console.error("syncPropertyMetadata: update property", updateErr.message)
  }
}
