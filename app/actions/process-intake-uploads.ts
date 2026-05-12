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
      return "Manual review: a likely address was extracted (see Address column). Add the postal code or confirm / edit below, or link an existing property."
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
  try {
    const supabase = createServerClient()
    const userId = await resolveOwnerUserId(supabase)

    // Safety net: a previous server action run may have set rows to "processing" and then
    // hit the function timeout (especially on batches of SOIL_CERTIFICATE / URBAN_PLANNING_INFO,
    // which used to run the full analysis pipeline inline). Re-queue any of this user's rows that
    // have been stuck on "processing" for over 2 minutes so this run picks them up again.
    const stuckCutoffIso = new Date(Date.now() - 2 * 60_000).toISOString()
    const { error: resetErr } = await supabase
      .from("intake_uploads")
      .update({ processing_status: "uploaded" })
      .eq("user_id", userId)
      .eq("processing_status", "processing")
      .lt("created_at", stuckCutoffIso)
    if (resetErr) {
      console.warn("[intake] process: stuck row reset failed", resetErr.message)
    }

    // Pick up any other rows that are still in "uploaded" state — e.g. ones we just reset above,
    // or ones from a previous browser tab where the upload succeeded but processing was cut short.
    const { data: pendingRows, error: pendingErr } = await supabase
      .from("intake_uploads")
      .select("id")
      .eq("user_id", userId)
      .eq("processing_status", "uploaded")
    if (pendingErr) {
      console.warn("[intake] process: pending row scan failed", pendingErr.message)
    }
    const pendingIds = (pendingRows ?? []).map((r) => r.id as string)
    const allIds = Array.from(new Set([...uploadIds, ...pendingIds]))

    if (!allIds.length) {
      return { ok: true }
    }

    for (const id of allIds) {
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
