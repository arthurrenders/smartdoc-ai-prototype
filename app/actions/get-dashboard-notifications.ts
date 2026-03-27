"use server"

import { createServerClient } from "@/lib/supabase/server"

export type DashboardNotificationRow = {
  id: string
  property_id: string
  document_id: string
  title: string
  body: string
  read_at: string | null
  created_at: string
  propertyDisplayName: string | null
}

export async function getDashboardNotifications(limit = 25): Promise<{
  data: DashboardNotificationRow[]
  error: string | null
}> {
  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from("notifications")
      .select("id, property_id, document_id, title, body, read_at, created_at, properties(display_name)")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return { data: [], error: error.message }
    }

    const rows = (data as Array<
      Omit<DashboardNotificationRow, "propertyDisplayName"> & {
        properties?: { display_name?: string | null } | { display_name?: string | null }[] | null
      }
    >) || []

    return {
      data: rows.map((r) => ({
        id: r.id,
        property_id: r.property_id,
        document_id: r.document_id,
        title: r.title,
        body: r.body,
        read_at: r.read_at,
        created_at: r.created_at,
        propertyDisplayName: Array.isArray(r.properties)
          ? r.properties[0]?.display_name ?? null
          : r.properties?.display_name ?? null,
      })),
      error: null,
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load notifications.",
    }
  }
}
