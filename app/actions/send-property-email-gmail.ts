"use server"

import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"
import { getValidAccessTokenForUser } from "@/lib/gmail/store"
import { buildRfc822Message, toGmailRawUrlSafe } from "@/lib/gmail/rfc822"

type SendEmailParams = {
  propertyId: string
  to: string
  subject: string
  body: string
}

export async function sendPropertyEmailViaGmail(
  params: SendEmailParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createServerClient()
    const ownerId = await resolveOwnerUserId(supabase)
    const { accessToken, gmailEmail } = await getValidAccessTokenForUser(supabase, ownerId)
    const raw = buildRfc822Message({
      fromEmail: gmailEmail,
      toEmail: params.to,
      subject: params.subject,
      body: params.body,
    })
    const encoded = toGmailRawUrlSafe(raw)
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Gmail API error: ${text}`)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" }
  }
}
