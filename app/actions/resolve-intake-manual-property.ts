"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"
import { linkIntakeUploadToManualProperty } from "@/lib/intake/match-or-create-property-from-document"

const schema = z.object({
  intakeUploadId: z.string().uuid(),
  propertyName: z.string().trim().max(200).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  selectedPropertyId: z.string().uuid().optional().nullable(),
})

/**
 * Manual fallback: resolve property from user input (match existing by name/address/raw line first),
 * create only when needed, then attach the queued intake PDF — same document path as automatic intake.
 */
export async function resolveIntakeManualProperty(input: z.infer<typeof schema>): Promise<{
  ok: boolean
  propertyId?: string
  error?: string
}> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors
    const msg =
      first.intakeUploadId?.[0] ?? first.propertyName?.[0] ?? first.address?.[0] ?? "Invalid input."
    return { ok: false, error: msg }
  }

  try {
    const supabase = createServerClient()
    const userId = await resolveOwnerUserId(supabase)

    const res = await linkIntakeUploadToManualProperty(supabase, {
      userId,
      intakeUploadId: parsed.data.intakeUploadId,
      displayName: parsed.data.propertyName?.trim() || "",
      addressLine: parsed.data.address?.trim() ? parsed.data.address.trim() : null,
      selectedPropertyId: parsed.data.selectedPropertyId?.trim() || null,
    })

    if (!res.ok) {
      return { ok: false, error: res.error }
    }

    revalidatePath("/intake")
    revalidatePath("/")
    revalidatePath(`/properties/${res.propertyId}`)
    return { ok: true, propertyId: res.propertyId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." }
  }
}
