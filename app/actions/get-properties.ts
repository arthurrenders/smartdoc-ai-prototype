"use server"

import { createServerClient } from "@/lib/supabase/server"

export type PropertyRow = {
  id: string
  created_at?: string
}

/**
 * Fetches all properties for the current user.
 * Returns fallback list with DEMO_PROPERTY_ID if the table is empty or RLS returns no rows,
 * so the dashboard always shows at least one property when configured.
 */
export async function getProperties(): Promise<{ data: PropertyRow[]; error: string | null }> {
  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from("properties")
      .select("id, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      return fallbackProperties()
    }

    if (!data || data.length === 0) {
      return fallbackProperties()
    }

    return { data, error: null }
  } catch {
    return fallbackProperties()
  }
}

function fallbackProperties(): { data: PropertyRow[]; error: string | null } {
  const demoId = process.env.DEMO_PROPERTY_ID
  if (demoId) {
    return { data: [{ id: demoId }], error: null }
  }
  return { data: [], error: null }
}
