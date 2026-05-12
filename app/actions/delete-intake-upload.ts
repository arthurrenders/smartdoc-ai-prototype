"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"

const schema = z.object({
  intakeUploadId: z.string().uuid(),
})

export async function deleteIntakeUpload(input: z.infer<typeof schema>): Promise<{
  ok: boolean
  error?: string
}> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Invalid intake upload id." }
  }

  try {
    const supabase = createServerClient()
    const userId = await resolveOwnerUserId(supabase)

    const { data: row, error: fetchErr } = await supabase
      .from("intake_uploads")
      .select("id, user_id, storage_path, processing_status, matched_property_id, created_property_id")
      .eq("id", parsed.data.intakeUploadId)
      .maybeSingle()

    if (fetchErr) return { ok: false, error: fetchErr.message }
    if (!row || row.user_id !== userId) {
      return { ok: false, error: "Intake upload not found." }
    }

    const status = String(row.processing_status ?? "")
    if (status === "processing") {
      return { ok: false, error: "This file is currently processing. Try again after it finishes." }
    }

    const linkedToProperty = Boolean(row.matched_property_id || row.created_property_id || status === "processed")
    if (!linkedToProperty && typeof row.storage_path === "string" && row.storage_path.trim()) {
      await supabase.storage.from("documents").remove([row.storage_path]).catch(() => {})
    }

    const { error: deleteErr } = await supabase
      .from("intake_uploads")
      .delete()
      .eq("id", parsed.data.intakeUploadId)
      .eq("user_id", userId)

    if (deleteErr) return { ok: false, error: deleteErr.message }

    revalidatePath("/intake")
    revalidatePath("/")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete intake upload." }
  }
}
