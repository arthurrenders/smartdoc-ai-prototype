/** One primary address per property (Belgium-first; geocode-ready). */

/** Candidate from document analysis before sync to property_addresses. */
export type ExtractedPropertyAddress = {
  raw_line1: string
  street_name: string | null
  house_number: string | null
  box: string | null
  postal_code: string | null
  municipality: string | null
  region: string | null
  confidence: number
  extraction_source: "structured_ai" | "text_heuristic"
}

export type PropertyAddressRecord = {
  id: string
  property_id: string
  source: string
  raw_line1: string
  /** Canonical single-line address for geocoding / enrichment; null until filled. */
  normalized_full_address: string | null
  street_name: string | null
  house_number: string | null
  box: string | null
  postal_code: string | null
  municipality: string | null
  region: string | null
  country_code: string
  latitude: number | null
  longitude: number | null
  geocoded_at: string | null
  /** Set only via on-demand geocode action; not updated on page load. */
  geocode_status: string
  geocode_error: string | null
  created_at?: string
  updated_at?: string
}
