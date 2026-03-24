import type { SupabaseClient } from "@supabase/supabase-js"
import { reverseGeocodeBelgium } from "@/lib/geocoding/reverse-nominatim-be"
import { fetchNearbyTransportStops } from "@/lib/geocoding/overpass-nearby-transport"
import {
  LOCATION_ENRICHMENT_LAYER,
  type LocationEnrichmentPayloadV1,
} from "@/lib/location-enrichment/types"

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "")
}

function normKey(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim()
}

/** Belgian postcodes are 4 digits; tolerate B-1000 style input. */
function extractBePostcodeDigits(value: string | null | undefined): string | null {
  if (!value) return null
  const m = value.replace(/\s/g, "").match(/\d{4}/)
  return m ? m[0] : null
}

function pickReverseMunicipality(addr: Record<string, string>): string | null {
  const v =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.hamlet ||
    ""
  const t = v.trim()
  return t || null
}

function municipalitiesLooselyMatch(
  stored: string | null | undefined,
  reverse: string | null
): boolean | null {
  if (!stored?.trim() || !reverse?.trim()) return null
  const a = normKey(stored)
  const b = normKey(reverse)
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  return false
}

export async function runAndPersistPropertyLocationEnrichment(
  supabase: SupabaseClient,
  propertyId: string,
  userAgent: string
): Promise<void> {
  const now = new Date().toISOString()

  const { data: addr, error: addrErr } = await supabase
    .from("property_addresses")
    .select(
      "latitude, longitude, geocode_status, postal_code, municipality, geocoded_at"
    )
    .eq("property_id", propertyId)
    .maybeSingle()

  if (addrErr) {
    throw new Error(addrErr.message ?? "Adres ophalen mislukt.")
  }

  const lat = asFiniteNumber(addr?.latitude)
  const lon = asFiniteNumber(addr?.longitude)
  const ok =
    addr?.geocode_status === "ok" && lat !== null && lon !== null

  if (!ok) {
    const { error: delErr } = await supabase
      .from("property_location_enrichment")
      .delete()
      .eq("property_id", propertyId)
    if (delErr) {
      throw new Error(delErr.message ?? "Verwijderen oude verrijking mislukt.")
    }
    throw new Error(
      "Locatieverrijking vereist een succesvol geocodeerd adres (coördinaten)."
    )
  }

  const reverse = await reverseGeocodeBelgium(lat, lon, userAgent)
  if (reverse.kind !== "ok") {
    const { error: upErr } = await supabase.from("property_location_enrichment").upsert(
      {
        property_id: propertyId,
        layer: LOCATION_ENRICHMENT_LAYER,
        status: "error",
        error_message: `Nominatim reverse: ${reverse.detail}`,
        payload: { version: 1 },
        enriched_at: now,
        updated_at: now,
      },
      { onConflict: "property_id" }
    )
    if (upErr) {
      throw new Error(upErr.message ?? "Opslaan mislukt.")
    }
    return
  }

  const cc = (reverse.address.country_code ?? "").toLowerCase()
  const inBelgium = cc === "be"

  const revPost = extractBePostcodeDigits(reverse.address.postcode)
  const storedPost = extractBePostcodeDigits(addr.postal_code)
  let postcodeConsistent: boolean | null = null
  if (storedPost && revPost) {
    postcodeConsistent = storedPost === revPost
  }

  const revMuni = pickReverseMunicipality(reverse.address)
  const municipalityConsistent = municipalitiesLooselyMatch(addr.municipality, revMuni)

  let nearbyTransport: LocationEnrichmentPayloadV1["nearbyTransport"] = null
  let overpassOk = false
  try {
    const ov = await fetchNearbyTransportStops(lat, lon, userAgent)
    if (ov.kind === "ok") {
      overpassOk = true
      const rail = ov.stops
        .filter((s) => s.kind === "rail_station")
        .slice(0, 3)
        .map((s) => ({ name: s.name, distanceM: s.distanceM }))
      const bus = ov.stops
        .filter((s) => s.kind === "bus_stop")
        .slice(0, 5)
        .map((s) => ({ name: s.name, distanceM: s.distanceM }))
      nearbyTransport = { nearestRailStations: rail, nearestBusStops: bus }
    }
  } catch {
    nearbyTransport = null
    overpassOk = false
  }

  const payload: LocationEnrichmentPayloadV1 = {
    version: 1,
    future: {},
    countryCode: cc || null,
    reverseDisplayName: reverse.displayName,
    reverseAddress: reverse.address,
    validation: {
      inBelgium,
      postcodeConsistent,
      municipalityConsistent,
    },
    nearbyTransport,
    sources: {
      nominatimReverse: true,
      overpass: overpassOk,
    },
  }

  const { error: upErr } = await supabase.from("property_location_enrichment").upsert(
    {
      property_id: propertyId,
      layer: LOCATION_ENRICHMENT_LAYER,
      status: "ok",
      error_message: null,
      payload,
      enriched_at: now,
      updated_at: now,
    },
    { onConflict: "property_id" }
  )

  if (upErr) {
    throw new Error(upErr.message ?? "Opslaan verrijking mislukt.")
  }
}
