"use server"

import "server-only"

import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"

export type IntakePropertyOption = {
  id: string
  displayName: string
  addressLine: string | null
}

export async function getIntakePropertyOptions(): Promise<{
  data: IntakePropertyOption[]
  error: string | null
}> {
  try {
    const supabase = createServerClient()
    const userId = await resolveOwnerUserId(supabase)

    const { data, error } = await supabase
      .from("properties")
      .select("id, display_name, property_addresses(raw_line1, normalized_full_address)")
      .eq("user_id", userId)
      .order("display_name", { ascending: true })

    if (error) {
      return { data: [], error: error.message }
    }

    return {
      data:
        (data ?? []).map((row) => {
          const addrRaw = (row as {
            property_addresses?:
              | { raw_line1?: string | null; normalized_full_address?: string | null }
              | { raw_line1?: string | null; normalized_full_address?: string | null }[]
              | null
          }).property_addresses
          const addr = Array.isArray(addrRaw) ? addrRaw[0] : addrRaw
          return {
            id: row.id as string,
            displayName: (row.display_name as string) ?? "Untitled property",
            addressLine: addr?.normalized_full_address?.trim() || addr?.raw_line1?.trim() || null,
          }
        }) ?? [],
      error: null,
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load properties.",
    }
  }
}
