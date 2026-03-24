export const LOCATION_ENRICHMENT_LAYER = "location_v1" as const

/** Stored in property_location_enrichment.payload (versioned JSON). */
export type LocationEnrichmentPayloadV1 = {
  version: 1
  /** Reserved for flood/risk/neighborhood layers later. */
  future?: Record<string, unknown>
  countryCode: string | null
  reverseDisplayName: string | null
  /** Subset of Nominatim address keys (town, postcode, suburb, …). */
  reverseAddress: Record<string, string>
  validation: {
    inBelgium: boolean
    /** null when stored postcode missing */
    postcodeConsistent: boolean | null
    /** null when stored municipality missing */
    municipalityConsistent: boolean | null
  }
  nearbyTransport: {
    nearestRailStations: { name: string; distanceM: number }[]
    nearestBusStops: { name: string; distanceM: number }[]
  } | null
  sources: {
    nominatimReverse: boolean
    overpass: boolean
  }
}

export function isLocationEnrichmentPayloadV1(
  raw: unknown
): raw is LocationEnrichmentPayloadV1 {
  if (!raw || typeof raw !== "object") return false
  const o = raw as Record<string, unknown>
  return o.version === 1 && typeof o.validation === "object" && o.validation !== null
}

/** Server-fetched row + parsed payload for the property detail UI. */
export type PropertyLocationEnrichmentView = {
  status: string
  layer: string
  error_message: string | null
  enriched_at: string
  payload: LocationEnrichmentPayloadV1 | null
}
