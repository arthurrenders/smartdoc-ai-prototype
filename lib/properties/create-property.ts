import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { geocodeResetPatch } from "@/lib/property-address/geocode-reset"

type CreatePropertyParams = {
  userId: string
  displayName: string
  addressLine?: string | null
  structuredAddress?: {
    street_name: string | null
    house_number: string | null
    box: string | null
    postal_code: string | null
    municipality: string | null
    country_code?: string | null
  } | null
  source: string
}

export async function createProperty(
  supabase: SupabaseClient,
  params: CreatePropertyParams
): Promise<{ ok: true; propertyId: string; propertyAddressId: string } | { ok: false; error: string }> {
  const now = new Date().toISOString()
  const { data: propRow, error: propErr } = await supabase
    .from("properties")
    .insert({
      user_id: params.userId,
      display_name: params.displayName.slice(0, 80),
      updated_at: now,
    })
    .select("id")
    .single()

  if (propErr || !propRow?.id) {
    return { ok: false, error: propErr?.message ?? "Failed to create property." }
  }

  const propertyId = propRow.id as string
  const structured = params.structuredAddress ?? null
  const rawLine = (params.addressLine?.trim() || params.displayName).slice(0, 500)

  const { data: addrIns, error: addrErr } = await supabase
    .from("property_addresses")
    .insert({
      property_id: propertyId,
      ...geocodeResetPatch(now),
      raw_line1: rawLine,
      street_name: structured?.street_name ?? null,
      house_number: structured?.house_number ?? null,
      box: structured?.box ?? null,
      postal_code: structured?.postal_code ?? null,
      municipality: structured?.municipality ?? null,
      region: null,
      country_code: structured?.country_code || "BE",
      source: params.source,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single()

  if (addrErr || !addrIns?.id) {
    await supabase.from("properties").delete().eq("id", propertyId)
    return { ok: false, error: addrErr?.message ?? "Failed to create property address." }
  }

  return { ok: true, propertyId, propertyAddressId: addrIns.id as string }
}
