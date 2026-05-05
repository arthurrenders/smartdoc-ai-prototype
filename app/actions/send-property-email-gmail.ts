"use server"

import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"
import { getValidAccessTokenForUser } from "@/lib/gmail/store"
import { buildRfc822Message, toGmailRawUrlSafe } from "@/lib/gmail/rfc822"
import { assertOwnerProperty } from "@/lib/supabase/ownership"
import { rejectControlChars } from "@/lib/validation"

const SendEmailSchema = z.object({
  propertyId: z.string().uuid(),
  to: z.string().email("Invalid recipient email address"),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(12000),
})

type SendEmailParams = z.infer<typeof SendEmailSchema>

export async function sendPropertyEmailViaGmail(
  params: SendEmailParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SendEmailSchema.safeParse(params)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" }
  }

  try {
    const supabase = createServerClient()
    const ownerId = await resolveOwnerUserId(supabase)
    await assertOwnerProperty(supabase, parsed.data.propertyId)
    const { accessToken, gmailEmail } = await getValidAccessTokenForUser(supabase, ownerId)
    const raw = buildRfc822Message({
      fromEmail: gmailEmail,
      toEmail: parsed.data.to,
      subject: rejectControlChars(parsed.data.subject),
      body: parsed.data.body,
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

