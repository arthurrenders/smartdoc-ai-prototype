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
}

export async function getDashboardNotifications(limit = 25): Promise<{
  data: DashboardNotificationRow[]
  error: string | null
}> {
  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from("notifications")
      .select("id, property_id, document_id, title, body, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return { data: [], error: error.message }
    }

    return {
      data: (data as DashboardNotificationRow[]) || [],
      error: null,
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load notifications.",
    }
  }
}
