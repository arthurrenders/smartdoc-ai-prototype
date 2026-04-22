import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@/lib/supabase/server"
import { exchangeAuthorizationCode, fetchGoogleEmail } from "@/lib/gmail/oauth-config"
import { upsertGmailTokens } from "@/lib/gmail/store"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"

const STATE_COOKIE = "gmail_oauth_state"

function fail(msg: string, base: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/settings?gmail=error&msg=${encodeURIComponent(msg)}`, base)
  )
}

export async function GET(request: Request) {
  const base = new URL(request.url).origin
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const cookieStore = cookies()
  const expected = cookieStore.get(STATE_COOKIE)?.value

  if (!code || !state || !expected || state !== expected) {
    return fail("Gmail connection was cancelled or the session expired. Please try again.", base)
  }

  cookieStore.delete(STATE_COOKIE)

  try {
    const tokens = await exchangeAuthorizationCode(code)
    const gmailEmail = await fetchGoogleEmail(tokens.access_token)
    const supabase = createServerClient()
    const userId = await resolveOwnerUserId(supabase)

    if (!tokens.refresh_token) {
      return fail(
        "No refresh token received. Revoke app access at myaccount.google.com/permissions and try again.",
        base
      )
    }

    await upsertGmailTokens(supabase, {
      userId,
      gmailEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
      scope: tokens.scope ?? null,
    })

    return NextResponse.redirect(new URL("/settings?gmail=connected", base))
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return fail(msg, base)
  }
}
