"use server"

import "server-only"
import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { geocodeResetPatch } from "@/lib/property-address/geocode-reset"
import { z } from "zod"

const DUPLICATE_NAME_MESSAGE =
  "Een pand met deze naam bestaat al. Kies een andere pandtitel of vink de optie uit."

function escapeForIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

/**
 * Update raw address line; optionally sync properties.display_name.
 * Resets geocode state so the user must geocode again after editing.
 */
export async function updatePropertyAddress(formData: FormData): Promise<void> {
  const rawPropertyId = formData.get("propertyId")
  const rawLine = formData.get("rawLine1")
  const syncDisplayName = formData.get("syncDisplayName") === "on"

  const propertyIdParsed = z.string().uuid().safeParse(
    typeof rawPropertyId === "string" ? rawPropertyId.trim() : ""
  )
  if (!propertyIdParsed.success) {
    throw new Error("Ongeldig pand-id.")
  }
  const propertyId = propertyIdParsed.data

  const rawLine1Parsed = z
    .string()
    .min(1, "Adres mag niet leeg zijn.")
    .max(500, "Adres is te lang (max. 500 tekens).")
    .transform((v) =>
      v
        .replace(/[\r\n]+/g, ", ")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .safeParse(typeof rawLine === "string" ? rawLine : "")

  if (!rawLine1Parsed.success) {
    throw new Error(rawLine1Parsed.error.issues[0]?.message ?? "Ongeldig adres.")
  }
  const rawLine1 = rawLine1Parsed.data
  console.info("[SmartDoc][address-edit-action] request payload", {
    propertyId,
    submittedRaw: typeof rawLine === "string" ? rawLine : null,
    normalizedRaw: rawLine1,
    syncDisplayName,
  })

  if (syncDisplayName && rawLine1.length > 80) {
    throw new Error(
      "Met ‘pandtitel bijwerken’ mag het adres maximaal 80 tekens zijn (zelfde limiet als bij nieuw pand)."
    )
  }

  const supabase = createServerClient()
  const now = new Date().toISOString()

  const { data: addrRow, error: addrFetchErr } = await supabase
    .from("property_addresses")
    .select("property_id")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (addrFetchErr) {
    throw new Error(addrFetchErr.message ?? "Adres ophalen mislukt.")
  }
  if (!addrRow) {
    throw new Error("Geen adresregistratie voor dit pand.")
  }

  if (syncDisplayName) {
    const { data: dup, error: dupErr } = await supabase
      .from("properties")
      .select("id")
      .ilike("display_name", escapeForIlike(rawLine1))
      .neq("id", propertyId)
      .limit(1)

    if (dupErr) {
      throw new Error(dupErr.message ?? "Kon pandtitel niet controleren.")
    }
    if (dup && dup.length > 0) {
      throw new Error(DUPLICATE_NAME_MESSAGE)
    }
  }

  const { error: upAddrErr } = await supabase
    .from("property_addresses")
    .update({
      raw_line1: rawLine1,
      source: "manual",
      ...geocodeResetPatch(now),
    })
    .eq("property_id", propertyId)

  if (upAddrErr) {
    throw new Error(upAddrErr.message ?? "Adres opslaan mislukt.")
  }
  console.info("[SmartDoc][address-edit-action] address saved", {
    propertyId,
    rawLine1,
  })

  const { error: enrichDelErr } = await supabase
    .from("property_location_enrichment")
    .delete()
    .eq("property_id", propertyId)
  if (enrichDelErr) {
    console.warn("[SmartDoc] enrichment verwijderen na adreswijziging:", enrichDelErr.message)
  }

  if (syncDisplayName) {
    const { error: propErr } = await supabase
      .from("properties")
      .update({
        display_name: rawLine1,
        updated_at: now,
      })
      .eq("id", propertyId)

    if (propErr) {
      if (propErr.code === "23505") {
        throw new Error(DUPLICATE_NAME_MESSAGE)
      }
      throw new Error(propErr.message ?? "Pandtitel bijwerken mislukt.")
    }
  }

  revalidatePath("/")
  // Address edits reset geocode fields; invalidate global map so removed coordinates disappear.
  revalidatePath("/map")
  revalidatePath(`/properties/${propertyId}`)
}
