"use server"

import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"
import type { IntakeUploadRow } from "@/lib/intake/types"

export async function getIntakeUploads(): Promise<{
  data: IntakeUploadRow[]
  error: string | null
}> {
  try {
    const supabase = createServerClient()
    const userId = await resolveOwnerUserId(supabase)

    const { data, error } = await supabase
      .from("intake_uploads")
      .select(
        "id, user_id, filename, source_relative_path, storage_path, processing_status, detected_document_type, extracted_address_raw, matched_property_id, created_property_id, confidence_score, needs_manual_review, error_message, mime_type, original_file_size, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      return { data: [], error: error.message }
    }

    return { data: (data as IntakeUploadRow[] | null) ?? [], error: null }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load intake uploads.",
    }
  }
}
