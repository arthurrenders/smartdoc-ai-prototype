"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"
import {
  matchOrCreatePropertyFromDocument,
  type MatchOrCreatePropertyResult,
} from "@/lib/intake/match-or-create-property-from-document"

function humanReviewMessage(result: Extract<MatchOrCreatePropertyResult, { outcome: "needs_manual_review" }>): string {
  switch (result.reason) {
    case "ambiguous_match":
      return `Manual review: ambiguous property match (${result.candidateCountStrong} strong, ${result.candidateCountMedium} medium candidates).`
    case "no_address_in_text":
      return "Manual review: could not extract a confident Belgian address line from the PDF."
    case "pdf_text_empty":
      return "Manual review: PDF contains no extractable text (may be scanned images only)."
    case "pdf_download_failed":
      return "Manual review: could not download the file from storage."
    case "extraction_insufficient_for_autocreate":
      return "Manual review: address signal is too weak to auto-create or auto-link a property."
    default:
      return "Manual review required."
  }
}

function buildIntakePatch(
  result: MatchOrCreatePropertyResult,
  prevStoragePath: string
): Record<string, unknown> {
  switch (result.outcome) {
    case "linked_existing":
    case "created_new":
      return {
        processing_status: "processed",
        detected_document_type: result.detectedDocumentType,
        extracted_address_raw: result.extractedAddressRaw,
        matched_property_id: result.outcome === "linked_existing" ? result.propertyId : null,
        created_property_id: result.outcome === "created_new" ? result.propertyId : null,
        confidence_score: result.confidenceScore,
        needs_manual_review: false,
        error_message: null,
        storage_path: result.finalStoragePath,
      }
    case "needs_manual_review":
      return {
        processing_status: "needs_review",
        detected_document_type: result.detectedDocumentType,
        extracted_address_raw: result.extractedAddressRaw,
        matched_property_id: null,
        created_property_id: null,
        confidence_score: result.confidenceScore,
        needs_manual_review: true,
        error_message: humanReviewMessage(result),
        storage_path: prevStoragePath,
      }
    case "failed":
      return {
        processing_status: "failed",
        detected_document_type: result.detectedDocumentType ?? "unknown",
        needs_manual_review: true,
        error_message: `Processing failed: ${result.reason}`,
        storage_path: prevStoragePath,
      }
    default:
      throw new Error("Unhandled intake match outcome")
  }
}

/**
 * Runs address extraction, property match-or-create, document registration, and updates `intake_uploads`.
 */
export async function processIntakeUploads(uploadIds: string[]): Promise<{
  ok: boolean
  error?: string
}> {
  if (!uploadIds.length) {
    return { ok: true }
  }

  try {
    const supabase = createServerClient()
    const userId = await resolveOwnerUserId(supabase)

    for (const id of uploadIds) {
      const { data: row, error: fetchErr } = await supabase
        .from("intake_uploads")
        .select("id, user_id, processing_status, filename, storage_path")
        .eq("id", id)
        .maybeSingle()

      if (fetchErr || !row || row.user_id !== userId) {
        console.warn("[intake] process: skip row", id, fetchErr?.message)
        continue
      }

      if (row.processing_status !== "uploaded" && row.processing_status !== "processing") {
        continue
      }

      const storagePath = row.storage_path as string
      const filename = row.filename as string

      await supabase.from("intake_uploads").update({ processing_status: "processing" }).eq("id", id)

      try {
        const result = await matchOrCreatePropertyFromDocument(supabase, {
          userId,
          intakeUploadId: id,
          storagePath,
          filename,
        })

        const patch = buildIntakePatch(result, storagePath)
        const { error: upErr } = await supabase.from("intake_uploads").update(patch).eq("id", id)
        if (upErr) {
          console.error("[intake] process: intake_uploads update failed", id, upErr.message)
        }

        if (result.outcome === "linked_existing" || result.outcome === "created_new") {
          revalidatePath(`/properties/${result.propertyId}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unexpected error"
        console.error("[intake] process: uncaught error for upload", id, msg)
        await supabase
          .from("intake_uploads")
          .update({
            processing_status: "failed",
            needs_manual_review: true,
            error_message: `Processing failed: ${msg}`,
          })
          .eq("id", id)
      }
    }

    revalidatePath("/intake")
    revalidatePath("/")
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Intake processing failed.",
    }
  }
}
