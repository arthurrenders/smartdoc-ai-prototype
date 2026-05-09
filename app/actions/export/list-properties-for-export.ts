"use server"

import { createServerClient } from "@/lib/supabase/server"
import { getOwnerUserId } from "@/lib/supabase/ownership"

export type ExportPropertyRow = {
  id: string
  display_name: string | null
  address_line: string | null
}

export async function listPropertiesForExport(): Promise<
  | { ok: true; properties: ExportPropertyRow[] }
  | { ok: false; error: string }
> {
  try {
    const supabase = createServerClient()
    const ownerUserId = await getOwnerUserId(supabase)
    const { data, error } = await supabase
      .from("properties")
      .select("id, display_name, property_addresses(normalized_full_address, raw_line1)")
      .eq("user_id", ownerUserId)
      .order("created_at", { ascending: false })

    if (error) return { ok: false, error: error.message }

    type Row = {
      id: string
      display_name: string | null
      property_addresses:
        | { normalized_full_address: string | null; raw_line1: string | null }
        | { normalized_full_address: string | null; raw_line1: string | null }[]
        | null
    }

    const properties: ExportPropertyRow[] = ((data as Row[] | null) ?? []).map((row) => {
      const addr = Array.isArray(row.property_addresses)
        ? row.property_addresses[0]
        : row.property_addresses
      return {
        id: row.id,
        display_name: row.display_name,
        address_line: addr?.normalized_full_address ?? addr?.raw_line1 ?? null,
      }
    })

    return { ok: true, properties }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kon panden niet laden." }
  }
}
