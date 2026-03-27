"use server"

import "server-only"
import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { geocodeBelgiumRawLine } from "@/lib/geocoding/nominatim-be"
import {
  decodeGeocodeCandidatesState,
  encodeGeocodeCandidatesState,
} from "@/lib/geocoding/geocode-candidate-state"
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
  const rawLineFromForm = formData.get("rawLine1")
  const propertyId = typeof rawId === "string" ? rawId.trim() : ""
  if (!propertyId) {
    throw new Error("Ontbrekend pand-id.")
  }

  const userAgent = requiredUserAgent()
  const supabase = createServerClient()
  const now = new Date().toISOString()

  const { data: row, error: fetchErr } = await supabase
    .from("property_addresses")
    .select("id, raw_line1, street_name, house_number, box, postal_code, municipality, country_code")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (fetchErr) {
    throw new Error(fetchErr.message ?? "Adres ophalen mislukt.")
  }
  if (!row) {
    throw new Error("Geen adresregistratie voor dit pand.")
  }

  const dbRawLine =
    typeof row.raw_line1 === "string"
      ? row.raw_line1
          .replace(/[\r\n]+/g, ", ")
          .replace(/\s*,\s*/g, ", ")
          .replace(/\s+/g, " ")
          .trim()
      : ""
  const submittedRawLine =
    typeof rawLineFromForm === "string"
      ? rawLineFromForm
          .replace(/[\r\n]+/g, ", ")
          .replace(/\s*,\s*/g, ", ")
          .replace(/\s+/g, " ")
          .trim()
      : ""
  const rawLine1 = submittedRawLine || dbRawLine

  console.info("[SmartDoc][geocode-action] request payload", {
    propertyId,
    submittedRawLine,
    dbRawLine,
    usedRawLine: rawLine1,
  })

  if (submittedRawLine && submittedRawLine !== dbRawLine) {
    const { error: syncErr } = await supabase
      .from("property_addresses")
      .update({
        raw_line1: submittedRawLine,
        geocode_status: "pending",
        geocode_error: null,
        updated_at: now,
      })
      .eq("property_id", propertyId)
    if (syncErr) {
      console.warn("[SmartDoc][geocode-action] failed syncing submitted raw_line1", {
        propertyId,
        message: syncErr.message,
      })
    } else {
      console.info("[SmartDoc][geocode-action] synced latest UI raw_line1 before request", {
        propertyId,
      })
    }
  }
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
    // Also refresh global map/list views that read property_addresses coordinates.
    revalidatePath("/map")
    revalidatePath("/")
    return
  }

  const outcome = await geocodeBelgiumRawLine(
    rawLine1,
    userAgent,
    {
      streetName: typeof row.street_name === "string" ? row.street_name : null,
      houseNumber: typeof row.house_number === "string" ? row.house_number : null,
      box: typeof row.box === "string" ? row.box : null,
      postalCode: typeof row.postal_code === "string" ? row.postal_code : null,
      municipality: typeof row.municipality === "string" ? row.municipality : null,
      countryCode: typeof row.country_code === "string" ? row.country_code : "BE",
    }
  )
  console.info("[SmartDoc][geocode-action] geocode response state", {
    propertyId,
    kind: outcome.kind,
    detail: "detail" in outcome ? outcome.detail : null,
  })

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
    // Root cause fix: geocode updates were not invalidating /map, leaving stale marker data.
    revalidatePath("/map")
    revalidatePath("/")
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
    revalidatePath("/map")
    revalidatePath("/")
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
    revalidatePath("/map")
    revalidatePath("/")
    return
  }

  if (outcome.kind === "ambiguous_candidates") {
    const { error: upErr } = await supabase
      .from("property_addresses")
      .update({
        geocode_status: "ambiguous",
        geocode_error: encodeGeocodeCandidatesState({
          kind: "ambiguous_candidates",
          detail: outcome.detail,
          query: outcome.query,
          candidates: outcome.candidates,
        }),
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
    revalidatePath("/map")
    revalidatePath("/")
    return
  }

  if (outcome.kind === "did_you_mean") {
    const { error: upErr } = await supabase
      .from("property_addresses")
      .update({
        geocode_status: "no_result",
        geocode_error: encodeGeocodeCandidatesState({
          kind: "did_you_mean",
          detail: outcome.detail,
          query: outcome.query,
          candidates: outcome.candidates,
        }),
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
    revalidatePath("/map")
    revalidatePath("/")
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
  revalidatePath("/map")
  revalidatePath("/")
}

export async function chooseGeocodeCandidate(formData: FormData): Promise<void> {
  const rawId = formData.get("propertyId")
  const rawIndex = formData.get("candidateIndex")
  const propertyId = typeof rawId === "string" ? rawId.trim() : ""
  const candidateIndex = typeof rawIndex === "string" ? Number(rawIndex) : NaN

  if (!propertyId) throw new Error("Ontbrekend pand-id.")
  if (!Number.isInteger(candidateIndex) || candidateIndex < 0) {
    throw new Error("Ongeldige kandidaatselectie.")
  }

  const now = new Date().toISOString()
  const supabase = createServerClient()
  const { data: row, error: fetchErr } = await supabase
    .from("property_addresses")
    .select("geocode_error")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (fetchErr || !row) {
    throw new Error(fetchErr?.message ?? "Adresstatus ophalen mislukt.")
  }

  const state = decodeGeocodeCandidatesState(row.geocode_error)
  if (!state || !state.candidates[candidateIndex]) {
    throw new Error("Geen geldige kandidaat beschikbaar.")
  }
  const chosen = state.candidates[candidateIndex]

  const { error: upErr } = await supabase
    .from("property_addresses")
    .update({
      latitude: chosen.latitude,
      longitude: chosen.longitude,
      normalized_full_address: chosen.displayName,
      street_name: chosen.streetName,
      house_number: chosen.houseNumber,
      postal_code: chosen.postalCode,
      municipality: chosen.municipality,
      region: chosen.region,
      geocoded_at: now,
      geocode_status: "ok",
      geocode_error: null,
      updated_at: now,
    })
    .eq("property_id", propertyId)

  if (upErr) {
    throw new Error(upErr.message ?? "Kandidaat opslaan mislukt.")
  }

  revalidatePath(`/properties/${propertyId}`)
  // Keep global map markers and dashboard counters in sync after candidate selection.
  revalidatePath("/map")
  revalidatePath("/")
}
