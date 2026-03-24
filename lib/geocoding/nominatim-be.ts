/**
 * Belgium-first forward geocoding via OpenStreetMap Nominatim (free, no API key).
 * Respect usage policy: identify via User-Agent, avoid bulk / high QPS.
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */

export type NominatimSuccess = {
  kind: "ok"
  latitude: number
  longitude: number
  normalizedFullAddress: string
  streetName: string | null
  houseNumber: string | null
  postalCode: string | null
  municipality: string | null
  region: string | null
}

export type NominatimFailure =
  | { kind: "no_result" }
  | { kind: "ambiguous"; detail: string }
  | { kind: "http_error"; detail: string }
  | { kind: "invalid_response"; detail: string }

export type NominatimGeocodeOutcome = NominatimSuccess | NominatimFailure

type NominatimFeature = {
  lat: string
  lon: string
  display_name?: string
  address?: Record<string, string | undefined>
}

function pickMunicipality(addr: Record<string, string | undefined> | undefined): string | null {
  if (!addr) return null
  const v =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.hamlet ||
    null
  return v?.trim() || null
}

function pickRegion(addr: Record<string, string | undefined> | undefined): string | null {
  if (!addr) return null
  const v = addr.state || addr.region || null
  return v?.trim() || null
}

function locationKey(lat: string, lon: string): string {
  return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`
}

/**
 * Query Nominatim with Belgium restriction. Deduplicates same coordinates; multiple distinct
 * locations → ambiguous (no automatic pick).
 */
export async function geocodeBelgiumRawLine(
  rawLine: string,
  userAgent: string
): Promise<NominatimGeocodeOutcome> {
  const q = rawLine.trim()
  if (!q) {
    return { kind: "invalid_response", detail: "Empty query" }
  }

  const params = new URLSearchParams({
    format: "json",
    q: `${q}, Belgium`,
    limit: "8",
    countrycodes: "be",
    addressdetails: "1",
  })

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`

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

  if (!Array.isArray(data) || data.length === 0) {
    return { kind: "no_result" }
  }

  const features = data as NominatimFeature[]
  const seen = new Set<string>()
  const unique: NominatimFeature[] = []
  for (const f of features) {
    if (typeof f.lat !== "string" || typeof f.lon !== "string") continue
    const k = locationKey(f.lat, f.lon)
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(f)
  }

  if (unique.length === 0) {
    return { kind: "no_result" }
  }

  if (unique.length > 1) {
    return {
      kind: "ambiguous",
      detail: `${unique.length} verschillende locaties; verfijn het adres.`,
    }
  }

  const hit = unique[0]
  const lat = Number(hit.lat)
  const lon = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { kind: "invalid_response", detail: "Invalid coordinates" }
  }

  const addr = hit.address
  const postcode = addr?.postcode?.trim() || null
  const municipality = pickMunicipality(addr)
  const region = pickRegion(addr)
  const normalizedFullAddress = (hit.display_name?.trim() || q).trim()
  const streetName = addr?.road?.trim() || null
  const houseNumber = addr?.house_number?.trim() || null

  return {
    kind: "ok",
    latitude: lat,
    longitude: lon,
    normalizedFullAddress,
    streetName,
    houseNumber,
    postalCode: postcode,
    municipality,
    region,
  }
}
