"use server"

export type PropertyRow = {
  id: string
  created_at?: string
  display_name?: string | null
}

/**
 * Loads every row from public.properties — no user_id or auth filter.
 * Uses PostgREST + service role (bypasses RLS) like other actions in this app.
 */
export async function getProperties(): Promise<{ data: PropertyRow[]; error: string | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { data: [], error: "Missing Supabase environment variables." }
  }

  try {
    const base = supabaseUrl.replace(/\/$/, "")
    const url = new URL(`${base}/rest/v1/properties`)
    url.searchParams.set("select", "id,created_at,display_name")
    url.searchParams.set("order", "created_at.desc")

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    })

    if (!res.ok) {
      let message = `Could not load properties (HTTP ${res.status}).`
      try {
        const body = (await res.json()) as { message?: string; details?: string }
        message = body.message ?? body.details ?? message
      } catch {
        // ignore
      }
      return { data: [], error: message }
    }

    const rows = (await res.json()) as PropertyRow[]
    return { data: Array.isArray(rows) ? rows : [], error: null }
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : "Failed to load properties.",
    }
  }
}
