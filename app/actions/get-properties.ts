"use server"

import { createServerClient } from "@/lib/supabase/server"

export type PropertyRow = {
  id: string
  created_at?: string
  display_name?: string | null
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

    // Avoid Supabase-js schema cache issues by enriching display_name via PostgREST fetch.
    const properties = data as PropertyRow[]
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    try {
      const idsPart = properties.map((p) => encodeURIComponent(p.id)).join(",")
      const res = await fetch(
        `${supabaseUrl}/rest/v1/properties?select=id,display_name&id=in.(${idsPart})`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      )

      if (res.ok) {
        const displayRows = (await res.json()) as Array<{ id: string; display_name?: string | null }>
        const byId = new Map(displayRows.map((r) => [r.id, r.display_name ?? null] as const))
        const enriched = properties.map((p) => ({ ...p, display_name: byId.get(p.id) ?? null }))
        return { data: enriched, error: null }
      }
    } catch {
      // Ignore and fall back to missing display_name values.
    }

    return { data: properties.map((p) => ({ ...p, display_name: null })), error: null }
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
