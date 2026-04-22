import "server-only"

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
export const OAUTH_IDENTITY_SCOPES = ["openid", "email", "profile"] as const

export function getGoogleOAuthClientConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Google OAuth env vars: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI"
    )
  }
  return { clientId, clientSecret, redirectUri }
}

export function buildGmailAuthorizeUrl(params: { state: string }): string {
  const { clientId, redirectUri } = getGoogleOAuthClientConfig()
  const scopes = [GMAIL_SEND_SCOPE, ...OAUTH_IDENTITY_SCOPES].join(" ")
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  u.searchParams.set("client_id", clientId)
  u.searchParams.set("redirect_uri", redirectUri)
  u.searchParams.set("response_type", "code")
  u.searchParams.set("scope", scopes)
  u.searchParams.set("access_type", "offline")
  u.searchParams.set("prompt", "consent")
  u.searchParams.set("state", params.state)
  return u.toString()
}

export async function exchangeAuthorizationCode(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
}> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthClientConfig()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  })
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${text}`)
  }
  return res.json()
}

export async function refreshAccessToken(refreshTokenPlain: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const { clientId, clientSecret } = getGoogleOAuthClientConfig()
  const body = new URLSearchParams({
    refresh_token: refreshTokenPlain,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  })
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed: ${text}`)
  }
  return res.json()
}

export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error("Failed to fetch Google user info")
  const data = await res.json()
  if (!data.email) throw new Error("No email in Google user info response")
  return data.email as string
}
