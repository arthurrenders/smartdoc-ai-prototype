import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { randomBytes } from "crypto"
import { buildGmailAuthorizeUrl } from "@/lib/gmail/oauth-config"

const STATE_COOKIE = "gmail_oauth_state"

export async function GET(request: Request) {
  try {
    const state = randomBytes(24).toString("hex")
    const cookieStore = cookies()
    cookieStore.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    })
    const url = buildGmailAuthorizeUrl({ state })
    return NextResponse.redirect(url)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.redirect(
      new URL(`/settings?gmail=error&msg=${encodeURIComponent(msg)}`, request.url)
    )
  }
}
