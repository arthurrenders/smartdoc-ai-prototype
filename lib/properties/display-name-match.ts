import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/** Escape % and _ so ilike is exact match, not a pattern (same as create-property). */
export function escapeForIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

/**
 * Case-insensitive exact display name for the owner (matches unique index on lower(display_name)).
 * Used so manual intake links to an existing property instead of failing on insert duplicate.
 */
export async function findPropertyIdByOwnerDisplayName(
  supabase: SupabaseClient,
  userId: string,
  displayName: string
): Promise<string | null> {
  const trimmed = displayName.trim()
  if (!trimmed) return null

  const { data, error } = await supabase
    .from("properties")
    .select("id")
    .eq("user_id", userId)
    .ilike("display_name", escapeForIlike(trimmed.slice(0, 80)))
    .limit(2)

  if (error || !data?.length) return null
  if (data.length > 1) return null
  return (data[0]!.id as string) ?? null
}

export async function assertPropertyExistsForUser(
  supabase: SupabaseClient,
  userId: string,
  propertyId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) return false
  return Boolean(data?.id)
}
