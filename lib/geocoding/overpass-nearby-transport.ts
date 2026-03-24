/**
 * Nearby rail stations and bus stops from OpenStreetMap via Overpass API.
 * Prototype: single bounded query, sort by distance in-process.
 * @see https://wiki.openstreetmap.org/wiki/Overpass_API
 */

export type NearbyTransportStop = {
  name: string
  distanceM: number
  kind: "rail_station" | "bus_stop"
}

export type OverpassNearbyOutcome =
  | { kind: "ok"; stops: NearbyTransportStop[] }
  | { kind: "error"; detail: string }

type OverpassElement = {
  type: string
  lat?: number
  lon?: number
  tags?: Record<string, string | undefined>
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const DEFAULT_OVERPASS = "https://overpass-api.de/api/interpreter"

export async function fetchNearbyTransportStops(
  latitude: number,
  longitude: number,
  userAgent: string
): Promise<OverpassNearbyOutcome> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { kind: "error", detail: "Invalid coordinates" }
  }

  const base =
    process.env.OVERPASS_API_URL?.trim() || DEFAULT_OVERPASS

  const q = `[out:json][timeout:12];
(
  node["railway"="station"](around:1200,${latitude},${longitude});
  node["highway"="bus_stop"](around:800,${latitude},${longitude});
);
out body 30;`

  let res: Response
  try {
    res = await fetch(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent,
      },
      body: `data=${encodeURIComponent(q)}`,
      cache: "no-store",
      signal: AbortSignal.timeout(18_000),
    })
  } catch (e) {
    return {
      kind: "error",
      detail: e instanceof Error ? e.message : "Network error",
    }
  }

  if (!res.ok) {
    return { kind: "error", detail: `HTTP ${res.status}` }
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { kind: "error", detail: "Invalid JSON" }
  }

  const elements = (data as { elements?: OverpassElement[] }).elements
  if (!Array.isArray(elements)) {
    return { kind: "error", detail: "Unexpected Overpass response" }
  }

  const stops: NearbyTransportStop[] = []
  for (const el of elements) {
    if (el.type !== "node") continue
    const lat = el.lat
    const lon = el.lon
    if (typeof lat !== "number" || typeof lon !== "number") continue
    const tags = el.tags ?? {}
    const isRail = tags.railway === "station"
    const isBus = tags.highway === "bus_stop"
    if (!isRail && !isBus) continue
    const name =
      (tags.name ?? tags["name:nl"] ?? tags["name:fr"] ?? "Zonder naam").trim() || "Zonder naam"
    const distanceM = Math.round(haversineM(latitude, longitude, lat, lon))
    stops.push({
      name,
      distanceM,
      kind: isRail ? "rail_station" : "bus_stop",
    })
  }

  stops.sort((a, b) => a.distanceM - b.distanceM)
  return { kind: "ok", stops }
}
