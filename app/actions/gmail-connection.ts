"use server"

import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"
import { getGmailTokenRow } from "@/lib/gmail/store"

export type GmailConnectionStatus =
  | { ok: true; connected: false }
  | { ok: true; connected: true; gmailEmail: string }
  | { ok: false; error: string }

export async function getGmailConnectionStatus(): Promise<GmailConnectionStatus> {
  try {
    const supabase = createServerClient()
    const userId = await resolveOwnerUserId(supabase)
    const row = await getGmailTokenRow(supabase, userId)
    if (!row) return { ok: true, connected: false }
    return { ok: true, connected: true, gmailEmail: row.gmail_email }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" }
  }
}
