"use server"

import "server-only"
import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { geocodeBelgiumRawLine } from "@/lib/geocoding/nominatim-be"
import { runAndPersistPropertyLocationEnrichment } from "@/lib/location-enrichment/run-enrichment"

function requiredUserAgent(): string {
  const ua = process.env.NOMINATIM_USER_AGENT?.trim()
  if (ua && ua.length >= 8) {
    return ua
  }
  throw new Error(
    "Stel NOMINATIM_USER_AGENT in (.env): een herkenbare contactstring voor Nominatim (zie OSM usage policy)."
  )
}

/**
 * On-demand geocode for one property's address row. Does not run on page load.
 */
export async function geocodePropertyAddress(formData: FormData): Promise<void> {
  const rawId = formData.get("propertyId")
  const propertyId = typeof rawId === "string" ? rawId.trim() : ""
  if (!propertyId) {
    throw new Error("Ontbrekend pand-id.")
  }

  const userAgent = requiredUserAgent()
  const supabase = createServerClient()
  const now = new Date().toISOString()

  const { data: row, error: fetchErr } = await supabase
    .from("property_addresses")
    .select("id, raw_line1")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (fetchErr) {
    throw new Error(fetchErr.message ?? "Adres ophalen mislukt.")
  }
  if (!row) {
    throw new Error("Geen adresregistratie voor dit pand.")
  }

  const rawLine1 = typeof row.raw_line1 === "string" ? row.raw_line1.trim() : ""
  if (!rawLine1) {
    await supabase
      .from("property_addresses")
      .update({
        geocode_status: "skipped_no_input",
        geocode_error: "Lege ruwe adresregel.",
        latitude: null,
        longitude: null,
        geocoded_at: null,
        normalized_full_address: null,
        street_name: null,
        house_number: null,
        postal_code: null,
        municipality: null,
        region: null,
        updated_at: now,
      })
      .eq("property_id", propertyId)
    revalidatePath(`/properties/${propertyId}`)
    return
  }

  const outcome = await geocodeBelgiumRawLine(rawLine1, userAgent)

  if (outcome.kind === "ok") {
    const { error: upErr } = await supabase
      .from("property_addresses")
      .update({
        latitude: outcome.latitude,
        longitude: outcome.longitude,
        normalized_full_address: outcome.normalizedFullAddress,
        street_name: outcome.streetName,
        house_number: outcome.houseNumber,
        postal_code: outcome.postalCode,
        municipality: outcome.municipality,
        region: outcome.region,
        geocoded_at: now,
        geocode_status: "ok",
        geocode_error: null,
        updated_at: now,
      })
      .eq("property_id", propertyId)

    if (upErr) {
      throw new Error(upErr.message ?? "Opslaan mislukt.")
    }
    try {
      await runAndPersistPropertyLocationEnrichment(supabase, propertyId, userAgent)
    } catch (e) {
      console.warn("[SmartDoc] location enrichment na geocode:", e)
    }
    revalidatePath(`/properties/${propertyId}`)
    return
  }

  if (outcome.kind === "no_result") {
    const { error: upErr } = await supabase
      .from("property_addresses")
      .update({
        geocode_status: "no_result",
        geocode_error: "Geen resultaat in België voor dit adres.",
        latitude: null,
        longitude: null,
        geocoded_at: null,
        normalized_full_address: null,
        street_name: null,
        house_number: null,
        postal_code: null,
        municipality: null,
        region: null,
        updated_at: now,
      })
      .eq("property_id", propertyId)

    if (upErr) {
      throw new Error(upErr.message ?? "Opslaan mislukt.")
    }
    revalidatePath(`/properties/${propertyId}`)
    return
  }

  if (outcome.kind === "ambiguous") {
    const { error: upErr } = await supabase
      .from("property_addresses")
      .update({
        geocode_status: "ambiguous",
        geocode_error: outcome.detail,
        latitude: null,
        longitude: null,
        geocoded_at: null,
        normalized_full_address: null,
        street_name: null,
        house_number: null,
        postal_code: null,
        municipality: null,
        region: null,
        updated_at: now,
      })
      .eq("property_id", propertyId)

    if (upErr) {
      throw new Error(upErr.message ?? "Opslaan mislukt.")
    }
    revalidatePath(`/properties/${propertyId}`)
    return
  }

  const detail = outcome.detail
  const { error: upErr } = await supabase
    .from("property_addresses")
    .update({
      geocode_status: "error",
      geocode_error: detail.slice(0, 500),
      updated_at: now,
    })
    .eq("property_id", propertyId)

  if (upErr) {
    throw new Error(upErr.message ?? "Opslaan mislukt.")
  }
  revalidatePath(`/properties/${propertyId}`)
}
