"use server"

import "server-only"
import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { runAndPersistPropertyLocationEnrichment } from "@/lib/location-enrichment/run-enrichment"

function requiredUserAgent(): string {
  const ua = process.env.NOMINATIM_USER_AGENT?.trim()
  if (ua && ua.length >= 8) {
    return ua
  }
  throw new Error(
    "Stel NOMINATIM_USER_AGENT in (.env): een herkenbare contactstring voor OSM (Nominatim / Overpass policy)."
  )
}

/**
 * On-demand location enrichment (stored in DB). Does not run on page load.
 */
export async function enrichPropertyLocation(formData: FormData): Promise<void> {
  const rawId = formData.get("propertyId")
  const propertyId = typeof rawId === "string" ? rawId.trim() : ""
  if (!propertyId) {
    throw new Error("Ontbrekend pand-id.")
  }

  const userAgent = requiredUserAgent()
  const supabase = createServerClient()
  await runAndPersistPropertyLocationEnrichment(supabase, propertyId, userAgent)
  revalidatePath(`/properties/${propertyId}`)
}
