import type { NominatimCandidate } from "@/lib/geocoding/nominatim-be"

const PREFIX = "GEOCODE_CANDIDATES_V1:"

export type GeocodeCandidatesState = {
  kind: "ambiguous_candidates" | "did_you_mean"
  detail: string
  query: string
  candidates: NominatimCandidate[]
}

export function encodeGeocodeCandidatesState(state: GeocodeCandidatesState): string {
  return `${PREFIX}${JSON.stringify(state)}`
}

export function decodeGeocodeCandidatesState(raw: string | null | undefined): GeocodeCandidatesState | null {
  if (!raw || !raw.startsWith(PREFIX)) return null
  const body = raw.slice(PREFIX.length)
  try {
    const parsed = JSON.parse(body) as Partial<GeocodeCandidatesState>
    if (
      (parsed?.kind === "ambiguous_candidates" || parsed?.kind === "did_you_mean") &&
      typeof parsed.detail === "string" &&
      typeof parsed.query === "string" &&
      Array.isArray(parsed.candidates)
    ) {
      return parsed as GeocodeCandidatesState
    }
    return null
  } catch {
    return null
  }
}

