/**
 * Reverse geocode (Belgium-first) via Nominatim.
 * Same usage policy as forward geocoding: identify with User-Agent, low QPS.
 */

export type NominatimReverseResult = {
  kind: "ok"
  displayName: string
  address: Record<string, string>
  latitude: number
  longitude: number
}

export type NominatimReverseFailure =
  | { kind: "http_error"; detail: string }
  | { kind: "invalid_response"; detail: string }

export type NominatimReverseOutcome = NominatimReverseResult | NominatimReverseFailure

type NominatimReverseJson = {
  lat?: string
  lon?: string
  display_name?: string
  address?: Record<string, string | undefined>
  error?: string
}

export async function reverseGeocodeBelgium(
  latitude: number,
  longitude: number,
  userAgent: string
): Promise<NominatimReverseOutcome> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { kind: "invalid_response", detail: "Invalid coordinates" }
  }

  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "nl,fr,en",
  })

  const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    return {
      kind: "http_error",
      detail: e instanceof Error ? e.message : "Network error",
    }
  }

  if (!res.ok) {
    return { kind: "http_error", detail: `HTTP ${res.status}` }
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { kind: "invalid_response", detail: "Invalid JSON" }
  }

  const j = data as NominatimReverseJson
  if (typeof j.error === "string" && j.error.trim()) {
    return { kind: "invalid_response", detail: j.error.trim() }
  }

  const lat = Number(j.lat)
  const lon = Number(j.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { kind: "invalid_response", detail: "Missing coordinates in response" }
  }

  const displayName = (j.display_name ?? "").trim()
  const rawAddr = j.address ?? {}
  const address: Record<string, string> = {}
  for (const [k, v] of Object.entries(rawAddr)) {
    if (typeof v === "string" && v.trim()) {
      address[k] = v.trim()
    }
  }

  return {
    kind: "ok",
    displayName: displayName || `${lat}, ${lon}`,
    address,
    latitude: lat,
    longitude: lon,
  }
}
