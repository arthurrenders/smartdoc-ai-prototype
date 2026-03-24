import type { SupabaseClient } from "@supabase/supabase-js"
import type { AnalysisResult } from "@/lib/analysis/detectors"
import { extractPropertyAddressCandidate } from "@/lib/property-address/extract-from-analysis"
import { geocodeResetPatch } from "@/lib/property-address/geocode-reset"

const MIN_CONFIDENCE = 0.72

function escapeForIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

function normAddr(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
}

/** Never persist address sync when the analyzer flagged a mismatched document type. */
function isWrongDocumentTypeResult(result: AnalysisResult): boolean {
  if (result.summary.toLowerCase().includes("wrong document type")) return true
  if (
    result.flags.some((f) => f.title.toLowerCase().includes("wrong document type"))
  ) {
    return true
  }
  return false
}

/**
 * After a successful analysis run: optionally update property_addresses + display_name from extracted address.
 * Does not call geocoding APIs.
 */
export async function syncPropertyAddressFromDocumentAnalysis(
  supabase: SupabaseClient,
  params: { propertyId: string; result: AnalysisResult; extractedText: string }
): Promise<void> {
  const { propertyId, result, extractedText } = params

  if (isWrongDocumentTypeResult(result)) return

  const candidate = extractPropertyAddressCandidate(result, extractedText)
  if (!candidate || candidate.confidence < MIN_CONFIDENCE) return

  const now = new Date().toISOString()

  const { data: row, error: fetchErr } = await supabase
    .from("property_addresses")
    .select("source, raw_line1, geocode_status")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (fetchErr) {
    console.error("syncPropertyAddress: fetch address row", fetchErr.message)
    return
  }

  if (row?.source === "manual") return

  if (
    row?.geocode_status === "ok" &&
    candidate.extraction_source === "text_heuristic"
  ) {
    return
  }

  if (row?.geocode_status === "ok" && candidate.confidence < 0.85) {
    return
  }

  const rawLine1 = candidate.raw_line1.trim().slice(0, 500)
  if (row?.raw_line1 && normAddr(row.raw_line1) === normAddr(rawLine1)) {
    return
  }

  const addrPayload = {
    ...geocodeResetPatch(now),
    raw_line1: rawLine1,
    street_name: candidate.street_name,
    house_number: candidate.house_number,
    box: candidate.box,
    postal_code: candidate.postal_code,
    municipality: candidate.municipality,
    region: candidate.region,
    source: "document_extraction",
  }

  const displayName =
    rawLine1.length > 80 ? rawLine1.slice(0, 80) : rawLine1

  if (row) {
    const { error: upErr } = await supabase
      .from("property_addresses")
      .update(addrPayload)
      .eq("property_id", propertyId)

    if (upErr) {
      console.error("syncPropertyAddress: update", upErr.message)
      return
    }
  } else {
    const { error: insErr } = await supabase.from("property_addresses").insert({
      property_id: propertyId,
      country_code: "BE",
      created_at: now,
      ...addrPayload,
    })

    if (insErr) {
      console.error("syncPropertyAddress: insert", insErr.message)
      return
    }
  }

  const { data: dup, error: dupErr } = await supabase
    .from("properties")
    .select("id")
    .ilike("display_name", escapeForIlike(displayName))
    .neq("id", propertyId)
    .limit(1)

  if (dupErr) {
    console.error("syncPropertyAddress: dup check", dupErr.message)
    return
  }

  if (dup && dup.length > 0) {
    return
  }

  const { error: propErr } = await supabase
    .from("properties")
    .update({
      display_name: displayName,
      updated_at: now,
    })
    .eq("id", propertyId)

  if (propErr) {
    console.error("syncPropertyAddress: property display_name", propErr.message)
  }
}
