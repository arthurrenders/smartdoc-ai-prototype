"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"
import {
  matchOrCreatePropertyFromDocument,
  reconcileCommittedIntakeDocument,
  type MatchOrCreatePropertyResult,
} from "@/lib/intake/match-or-create-property-from-document"

const MAX_INTAKE_ROWS_PER_CALL = 3
/** Upper bound (incl. tail-extension for upload-only siblings) so we stay safely inside the Vercel
 * function timeout even if a folder contains many bodemattest / stedenbouwkundige PDFs. */
const MAX_INTAKE_ROWS_HARD_CAP = 8

/**
 * Upload-only types (Bodemattest, Stedenbouwkundige inlichtingen) don't run Gemini
 * address extraction in `matchOrCreatePropertyFromDocument` — they rely on either a
 * Belgian-style address line in the PDF OR a source-context match against existing
 * `property_addresses`. Processing them AFTER non-upload-only types in the same batch
 * lets EPC/asbest/elektrisch create the property first, so source-context can find it.
 */
function isLikelyUploadOnlyByName(filename: string | null, sourceRelativePath: string | null): boolean {
  const text = `${filename ?? ""} ${sourceRelativePath ?? ""}`.toLowerCase()
  return (
    text.includes("bodem") ||
    text.includes("ovam") ||
    text.includes("grondinformatie") ||
    text.includes("grondeninformatie") ||
    text.includes("stedenbouw") ||
    text.includes("stedebouw") ||
    text.includes("vastgoedinformatie") ||
    text.includes("omgevingsinformatie") ||
    text.includes("omgevingsvergunning")
  )
}

function isUploadOnlyDetectedType(type: string | null | undefined): boolean {
  return type === "soil_certificate" || type === "urban_planning_info"
}

function humanReviewMessage(result: Extract<MatchOrCreatePropertyResult, { outcome: "needs_manual_review" }>): string {
  switch (result.reason) {
    case "ambiguous_match":
      return `Handmatige controle: dubbelzinnige pandmatch (${result.candidateCountStrong} sterke, ${result.candidateCountMedium} gemiddelde kandidaten).`
    case "no_address_in_text":
      return "Handmatige controle: geen betrouwbaar Belgisch adres uit de PDF gehaald."
    case "pdf_text_empty":
      return "Handmatige controle: de PDF bevat geen extraheerbare tekst (mogelijk alleen gescande beelden)."
    case "pdf_download_failed":
      return "Handmatige controle: bestand kon niet uit de opslag worden gedownload."
    case "extraction_insufficient_for_autocreate":
      return "Handmatige controle: er werd een mogelijk adres gevonden. Voeg de postcode toe, bevestig of bewerk hieronder, of koppel een bestaand pand."
    default:
      return "Handmatige controle nodig."
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
  processedCount?: number
  remainingCount?: number
}> {
  try {
    const supabase = createServerClient()
    const userId = await resolveOwnerUserId(supabase)

    // Safety net: a previous server action run may have set rows to "processing" and then
    // hit the function timeout (especially on batches of SOIL_CERTIFICATE / URBAN_PLANNING_INFO,
    // which used to run the full analysis pipeline inline). Re-queue any of this user's rows that
    // have been stuck on "processing" for more than ~20s so this run picks them up again. The old
    // 2-minute floor meant the queue badge stayed yellow ("Bezig / Wacht op verwerking") for two
    // full minutes after the drain finished — even when the document was already attached to the
    // correct property.
    const stuckCutoffIso = new Date(Date.now() - 20_000).toISOString()
    const { error: resetErr } = await supabase
      .from("intake_uploads")
      .update({ processing_status: "uploaded", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("processing_status", "processing")
      .lt("updated_at", stuckCutoffIso)
    if (resetErr) {
      console.warn("[intake] process: stuck row reset failed", resetErr.message)
    }

    // Eager reconcile sweep: any row whose document was already attached during a previous
    // (timed-out) call can be marked "processed" without re-running matchOrCreate. Without this,
    // rows had to wait their turn inside the per-call MAX-bounded loop, and a row outside that
    // window stayed yellow even though the document existed on the right property.
    const { data: stuckRowsForReconcile } = await supabase
      .from("intake_uploads")
      .select("id, filename, source_relative_path, storage_path")
      .eq("user_id", userId)
      .eq("processing_status", "processing")
    for (const row of (stuckRowsForReconcile ?? []) as Array<{
      id: string
      filename: string
      source_relative_path: string | null
      storage_path: string
    }>) {
      try {
        const rec = await reconcileCommittedIntakeDocument(supabase, {
          userId,
          intakeUploadId: row.id,
          filename: row.filename,
          sourceRelativePath: row.source_relative_path,
        })
        if (!rec) continue
        const patch = {
          ...buildIntakePatch(rec, row.storage_path),
          updated_at: new Date().toISOString(),
        }
        const { error: upErr } = await supabase.from("intake_uploads").update(patch).eq("id", row.id)
        if (upErr) {
          console.error("[intake] process: eager reconcile patch failed", row.id, upErr.message)
          continue
        }
        if (row.storage_path && row.storage_path !== rec.finalStoragePath) {
          await supabase.storage
            .from("documents")
            .remove([row.storage_path])
            .catch((err) => console.warn("[intake] process: eager reconcile blob cleanup", err))
        }
        revalidatePath(`/properties/${rec.propertyId}`)
      } catch (e) {
        console.warn("[intake] process: eager reconcile threw", row.id, e)
      }
    }

    // Pick up any other rows that are still in "uploaded" state — e.g. ones we just reset above,
    // or ones from a previous browser tab where the upload succeeded but processing was cut short.
    // Upload-only types (bodemattest, stedenbouwkundige) that ended in `needs_review` because the
    // property hadn't been created yet are also picked up so a later drain pass can source-match
    // them once EPC/asbest/elektrisch have created the property in this batch.
    const { data: pendingRows, error: pendingErr } = await supabase
      .from("intake_uploads")
      .select(
        "id, filename, source_relative_path, detected_document_type, processing_status, updated_at"
      )
      .eq("user_id", userId)
      .in("processing_status", ["uploaded", "processing", "needs_review"])
    if (pendingErr) {
      console.warn("[intake] process: pending row scan failed", pendingErr.message)
    }
    // Cooldown so a single drain session retries each needs_review row at most once. Without this,
    // a batch of files that all stay needs_review (e.g. only bodemattest uploads with no matching
    // property folder) would loop until drainIntakeQueue's hard guard.
    const needsReviewRetryCutoffMs = Date.now() - 30_000

    type PendingMeta = {
      id: string
      filename: string | null
      sourceRelativePath: string | null
      detectedType: string | null
      processingStatus: string | null
      updatedAtMs: number | null
      uploadOnly: boolean
    }
    const pendingMetaById = new Map<string, PendingMeta>()
    for (const r of pendingRows ?? []) {
      const filename = (r as { filename?: string | null }).filename ?? null
      const sourceRelativePath = (r as { source_relative_path?: string | null }).source_relative_path ?? null
      const detectedType = (r as { detected_document_type?: string | null }).detected_document_type ?? null
      const processingStatus = (r as { processing_status?: string | null }).processing_status ?? null
      const updatedAtRaw = (r as { updated_at?: string | null }).updated_at ?? null
      const updatedAtMs = updatedAtRaw ? Date.parse(updatedAtRaw) : NaN
      const uploadOnly =
        isUploadOnlyDetectedType(detectedType) || isLikelyUploadOnlyByName(filename, sourceRelativePath)
      pendingMetaById.set(r.id as string, {
        id: r.id as string,
        filename,
        sourceRelativePath,
        detectedType,
        processingStatus,
        updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : null,
        uploadOnly,
      })
    }

    // Only re-pick `needs_review` rows when they're upload-only types whose previous attempt happened
    // long enough ago that a subsequent file in the same drain session may have created the matching
    // property. Ambiguous matches still require the user to disambiguate — retrying those endlessly
    // would loop forever.
    const pendingIds: string[] = []
    for (const meta of pendingMetaById.values()) {
      if (meta.processingStatus === "needs_review") {
        if (!meta.uploadOnly) continue
        if (meta.updatedAtMs != null && meta.updatedAtMs > needsReviewRetryCutoffMs) continue
      }
      pendingIds.push(meta.id)
    }

    const allIds = Array.from(new Set([...uploadIds, ...pendingIds]))
    // Process non-upload-only types first so the property exists by the time bodemattest / stedenbouw
    // try to source-context match in a later batch slot (or this same call's tail).
    allIds.sort((a, b) => {
      const ua = pendingMetaById.get(a)?.uploadOnly ? 1 : 0
      const ub = pendingMetaById.get(b)?.uploadOnly ? 1 : 0
      return ua - ub
    })

    function folderKeyForMeta(meta: PendingMeta | undefined): string | null {
      if (!meta) return null
      const src = meta.sourceRelativePath?.trim()
      if (!src) return null
      const lastSlash = src.lastIndexOf("/")
      if (lastSlash <= 0) return null
      return src.slice(0, lastSlash).toLowerCase()
    }

    // Tail-extend idsForRun with upload-only siblings (same source folder) of any non-upload-only
    // row already in the batch. The bodemattest / stedenbouwkundige then gets processed in the same
    // server round-trip as the EPC that creates their property — so its badge jumps straight from
    // "In wachtrij" to "Gekoppeld" instead of sitting blue while drainIntakeQueue makes another hop.
    const baseSlice = allIds.slice(0, MAX_INTAKE_ROWS_PER_CALL)
    const inBatchFolders = new Set<string>()
    for (const id of baseSlice) {
      const folder = folderKeyForMeta(pendingMetaById.get(id))
      if (folder && !pendingMetaById.get(id)?.uploadOnly) {
        inBatchFolders.add(folder)
      }
    }
    const baseSliceSet = new Set(baseSlice)
    const folderSiblingIds: string[] = []
    const siblingBudget = Math.max(0, MAX_INTAKE_ROWS_HARD_CAP - baseSlice.length)
    for (const meta of pendingMetaById.values()) {
      if (folderSiblingIds.length >= siblingBudget) break
      if (baseSliceSet.has(meta.id)) continue
      if (!meta.uploadOnly) continue
      if (meta.processingStatus !== "uploaded" && meta.processingStatus !== "processing") continue
      const folder = folderKeyForMeta(meta)
      if (folder && inBatchFolders.has(folder)) {
        folderSiblingIds.push(meta.id)
      }
    }
    const idsForRun = [...baseSlice, ...folderSiblingIds]
    const remainingCount = Math.max(0, allIds.length - idsForRun.length)

    if (!idsForRun.length) {
      return { ok: true, processedCount: 0, remainingCount: 0 }
    }

    let processedCount = 0
    for (const id of idsForRun) {
      const { data: row, error: fetchErr } = await supabase
        .from("intake_uploads")
        .select(
          "id, user_id, processing_status, filename, source_relative_path, storage_path, detected_document_type"
        )
        .eq("id", id)
        .maybeSingle()

      if (fetchErr || !row || row.user_id !== userId) {
        console.warn("[intake] process: skip row", id, fetchErr?.message)
        continue
      }

      if (
        row.processing_status !== "uploaded" &&
        row.processing_status !== "processing" &&
        row.processing_status !== "needs_review"
      ) {
        continue
      }

      const storagePath = row.storage_path as string
      const filename = row.filename as string
      const sourceRelativePath = (row.source_relative_path as string | null | undefined) ?? null

      const reconciled = await reconcileCommittedIntakeDocument(supabase, {
        userId,
        intakeUploadId: id,
        filename,
        sourceRelativePath,
      })
      if (reconciled) {
        const patch = {
          ...buildIntakePatch(reconciled, storagePath),
          updated_at: new Date().toISOString(),
        }
        const { error: upErr } = await supabase.from("intake_uploads").update(patch).eq("id", id)
        if (upErr) {
          console.error("[intake] process: reconciled intake_uploads update failed", id, upErr.message)
        } else if (storagePath && storagePath !== reconciled.finalStoragePath) {
          await supabase.storage
            .from("documents")
            .remove([storagePath])
            .catch((err) => console.warn("[intake] process: intake blob cleanup", err))
        }
        revalidatePath(`/properties/${reconciled.propertyId}`)
        revalidatePath("/map")
        processedCount++
        continue
      }

      if (row.processing_status === "needs_review") {
        // Retry only upload-only types (bodemattest / stedenbouw) whose match likely failed because
        // the property hadn't been created yet by an earlier file in the batch. matchOrCreate will
        // re-fetch property_addresses, so a new property added in this drain pass becomes visible.
        // Ambiguous matches that need human disambiguation are not retried here because the row
        // metadata reflects the same address state until the user intervenes.
        const meta = pendingMetaById.get(id)
        const detectedType = (row as { detected_document_type?: string | null }).detected_document_type ?? null
        const uploadOnly =
          meta?.uploadOnly ??
          (isUploadOnlyDetectedType(detectedType) ||
            isLikelyUploadOnlyByName(filename, sourceRelativePath))
        if (!uploadOnly) continue
      }

      await supabase
        .from("intake_uploads")
        .update({ processing_status: "processing", updated_at: new Date().toISOString() })
        .eq("id", id)

      try {
        const result = await matchOrCreatePropertyFromDocument(supabase, {
          userId,
          intakeUploadId: id,
          storagePath,
          filename,
          sourceRelativePath,
        })

        const patch = { ...buildIntakePatch(result, storagePath), updated_at: new Date().toISOString() }
        const { error: upErr } = await supabase.from("intake_uploads").update(patch).eq("id", id)
        if (upErr) {
          console.error("[intake] process: intake_uploads update failed", id, upErr.message)
        }

        if (result.outcome === "linked_existing" || result.outcome === "created_new") {
          // Patch is persisted — safe to drop the original intake blob now. If this fails it
          // leaves an orphan in intake/ but causes no functional issue; the next intake load
          // recovers gracefully because intake_uploads.processing_status is already "processed".
          if (storagePath && storagePath !== result.finalStoragePath) {
            await supabase.storage
              .from("documents")
              .remove([storagePath])
              .catch((err) => console.warn("[intake] process: intake blob cleanup", err))
          }
          revalidatePath(`/properties/${result.propertyId}`)
          revalidatePath("/map")
        }
        processedCount++
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unexpected error"
        console.error("[intake] process: uncaught error for upload", id, msg)
        await supabase
          .from("intake_uploads")
          .update({
            processing_status: "failed",
            needs_manual_review: true,
            error_message: `Processing failed: ${msg}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
      }
    }

    revalidatePath("/intake")
    revalidatePath("/")
    revalidatePath("/map")
    return { ok: true, processedCount, remainingCount }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Intake processing failed.",
    }
  }
}
