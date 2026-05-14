import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { encryptTokenPlaintext, decryptTokenCiphertext } from "./token-crypto"
import { refreshAccessToken } from "./oauth-config"

type GmailTokenRow = {
  user_id: string
  gmail_email: string
  access_token_enc: string
  refresh_token_enc: string
  access_token_expires_at: string
  scope: string | null
}

export async function upsertGmailTokens(
  supabase: SupabaseClient,
  params: {
    userId: string
    gmailEmail: string
    accessToken: string
    refreshToken: string
    expiresInSeconds: number
    scope: string | null
  }
): Promise<void> {
  const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
  const now = new Date().toISOString()
  const { error } = await supabase.from("realtor_gmail_tokens").upsert(
    {
      user_id: params.userId,
      gmail_email: params.gmailEmail,
      access_token_enc: encryptTokenPlaintext(params.accessToken),
      refresh_token_enc: encryptTokenPlaintext(params.refreshToken),
      access_token_expires_at: expiresAt,
      scope: params.scope ?? null,
      updated_at: now,
    },
    { onConflict: "user_id" }
  )
  if (error) throw new Error(`Failed to store Gmail tokens: ${error.message}`)
}

export async function getGmailTokenRow(
  supabase: SupabaseClient,
  userId: string
): Promise<GmailTokenRow | null> {
  const { data, error } = await supabase
    .from("realtor_gmail_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(`Failed to read Gmail tokens: ${error.message}`)
  return data as GmailTokenRow | null
}

export async function getValidAccessTokenForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ accessToken: string; gmailEmail: string }> {
  const row = await getGmailTokenRow(supabase, userId)
  if (!row) {
    throw new Error("Gmail is not connected. Connect Gmail in Settings first.")
  }

  const expiresAt = new Date(row.access_token_expires_at).getTime()
  const nowPlusBuf = Date.now() + 60_000

  if (expiresAt > nowPlusBuf) {
    return {
      accessToken: decryptTokenCiphertext(row.access_token_enc),
      gmailEmail: row.gmail_email,
    }
  }

  const refreshPlain = decryptTokenCiphertext(row.refresh_token_enc)
  let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>
  try {
    refreshed = await refreshAccessToken(refreshPlain)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("invalid_grant")) {
      // Refresh token was revoked or expired; drop the stale row so the UI
      // reflects "niet verbonden" and the realtor can reconnect cleanly.
      await supabase.from("realtor_gmail_tokens").delete().eq("user_id", userId)
      throw new Error(
        "Gmail-koppeling is verlopen of ingetrokken. Verbind Gmail opnieuw in Instellingen."
      )
    }
    throw err
  }
  const newAccess = refreshed.access_token
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from("realtor_gmail_tokens")
    .update({
      access_token_enc: encryptTokenPlaintext(newAccess),
      access_token_expires_at: newExpiresAt,
      updated_at: now,
    })
    .eq("user_id", userId)
  if (error) {
    console.error("Failed to persist refreshed Gmail token:", error.message)
  }

  return { accessToken: newAccess, gmailEmail: row.gmail_email }
}
