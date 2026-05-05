"use server"

import { createServerClient } from "@/lib/supabase/server"
import { getOwnerUserId } from "@/lib/supabase/ownership"

export type PropertyRow = {
  id: string
  created_at?: string
  display_name?: string | null
}

export async function getProperties(): Promise<{ data: PropertyRow[]; error: string | null }> {
  try {
    const supabase = createServerClient()
    const ownerUserId = await getOwnerUserId(supabase)
    const { data, error } = await supabase
      .from("properties")
      .select("id,created_at,display_name")
      .eq("user_id", ownerUserId)
      .order("created_at", { ascending: false })

    if (error) return { data: [], error: error.message }
    return { data: (data as PropertyRow[] | null) ?? [], error: null }
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : "Failed to load properties.",
    }
  }
}

