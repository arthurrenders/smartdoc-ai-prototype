import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"

type SupabaseAdmin = ReturnType<typeof createServerClient>

/**
 * Single-user prototype: resolve the UUID used as properties.user_id / intake_uploads.user_id.
 * Order: PROPERTIES_OWNER_USER_ID → DEMO_PROPERTY_ID row → any property row.
 */
export async function resolveOwnerUserId(supabase: SupabaseAdmin): Promise<string> {
  const fromEnv = process.env.PROPERTIES_OWNER_USER_ID?.trim()
  const envParsed = fromEnv ? z.string().uuid().safeParse(fromEnv) : null
  if (envParsed?.success) {
    return envParsed.data
  }

  const demoId = process.env.DEMO_PROPERTY_ID?.trim()
  const demoParsed = demoId ? z.string().uuid().safeParse(demoId) : null
  if (demoParsed?.success) {
    const { data, error } = await supabase
      .from("properties")
      .select("user_id")
      .eq("id", demoParsed.data)
      .maybeSingle()

    if (!error && data?.user_id) {
      const uid = z.string().uuid().safeParse(data.user_id)
      if (uid.success) return uid.data
    }
  }

  const { data: row, error: rowError } = await supabase
    .from("properties")
    .select("user_id")
    .limit(1)
    .maybeSingle()

  if (!rowError && row?.user_id) {
    const uid = z.string().uuid().safeParse(row.user_id)
    if (uid.success) return uid.data
  }

  throw new Error(
    "Could not resolve owner user id. Set PROPERTIES_OWNER_USER_ID in .env.local to the UUID in properties.user_id (Supabase), " +
      "or set DEMO_PROPERTY_ID to an existing property id so user_id can be read from that row."
  )
}

/** Non-throwing variant: returns `null` when no owner can be resolved (zero properties + no env var). */
export async function tryResolveOwnerUserId(supabase: SupabaseAdmin): Promise<string | null> {
  try {
    return await resolveOwnerUserId(supabase)
  } catch {
    return null
  }
}
