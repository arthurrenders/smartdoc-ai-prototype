"use server"

import "server-only"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"

const PDF_MIME = "application/pdf"

function sanitizeStorageSegment(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._-]+/g, "_")
  return base.length > 180 ? base.slice(0, 180) : base
}

export type BulkIntakeFileResult = {
  filename: string
  intakeId?: string
  error?: string
}

export async function bulkIntakeUpload(formData: FormData): Promise<{
  ok: boolean
  results: BulkIntakeFileResult[]
  error?: string
}> {
  const rawFiles = formData.getAll("files")
  const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0)
  const rawPaths = formData.getAll("relativePaths").map((p) => (typeof p === "string" ? p : ""))

  if (files.length === 0) {
    return { ok: false, results: [], error: "No files provided." }
  }

  const supabase = createServerClient()
  let userId: string
  try {
    userId = await resolveOwnerUserId(supabase)
  } catch (e) {
    return {
      ok: false,
      results: [],
      error: e instanceof Error ? e.message : "Could not resolve user.",
    }
  }

  const results: BulkIntakeFileResult[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const sourceRelativePath =
      rawPaths[i]?.trim() ||
      (file.webkitRelativePath && file.webkitRelativePath.length > 0 ? file.webkitRelativePath : null)

    if (file.type !== PDF_MIME && !file.name.toLowerCase().endsWith(".pdf")) {
      results.push({
        filename: file.name,
        error: "Only PDF files are allowed.",
      })
      continue
    }

    const unique = randomUUID()
    const safeName = sanitizeStorageSegment(file.name) || "document.pdf"
    const storagePath = `intake/${userId}/${unique}_${safeName}`

    const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file, {
      contentType: PDF_MIME,
      upsert: false,
    })

    if (uploadError) {
      results.push({
        filename: file.name,
        error: uploadError.message,
      })
      continue
    }

    const { data: row, error: insertError } = await supabase
      .from("intake_uploads")
      .insert({
        user_id: userId,
        filename: file.name,
        source_relative_path: sourceRelativePath,
        storage_path: storagePath,
        processing_status: "uploaded",
        needs_manual_review: true,
        mime_type: file.type || PDF_MIME,
        original_file_size: file.size,
      })
      .select("id")
      .single()

    if (insertError || !row?.id) {
      await supabase.storage.from("documents").remove([storagePath]).catch(() => {})
      results.push({
        filename: file.name,
        error: insertError?.message ?? "Database insert failed.",
      })
      continue
    }

    results.push({ filename: file.name, intakeId: row.id as string })
  }

  const anyOk = results.some((r) => r.intakeId)
  revalidatePath("/intake")

  return { ok: anyOk, results }
}
