"use server"

import "server-only"

import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"

export type IntakePropertyOption = {
  id: string
  displayName: string
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
      .select("id, display_name")
      .eq("user_id", userId)
      .order("display_name", { ascending: true })

    if (error) {
      return { data: [], error: error.message }
    }

    return {
      data:
        (data ?? []).map((row) => ({
          id: row.id as string,
          displayName: (row.display_name as string) ?? "Untitled property",
        })) ?? [],
      error: null,
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load properties.",
    }
  }
}
