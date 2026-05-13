import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { detectDocumentTypeFromPdfText, executeAnalysisRunPipeline } from "@/lib/analysis/execute-analysis-run"
import { extractTextFromPDF, extractTextFromPDFFallback } from "@/lib/pdf/extractor"
import type { IntakeDetectedDocumentType } from "@/lib/intake/types"
import { setActiveDocumentVersion } from "@/lib/documents/active-version"

/**
 * Central place for “document belongs to property + analysis pipeline”.
 *
 * Intake and other flows used to insert `documents` + `analysis_runs` with status `queued` but nothing
 * ever invoked the same pipeline as the property UI’s “Run analysis” button, so files never appeared
 * in compliance views and never produced results. All attachment paths should call this helper after
 * the storage-backed `documents` row exists.
 *
 * **Unified handling:** Intake-linked PDFs must get a real `document_type_id` whenever possible (intake
 * hint, filename, then PDF text), so they show under the same “Verification Documents” rows as uploads
 * from the property page — no separate UI bucket.
 */

function documentTypeNameFromIntake(detected: IntakeDetectedDocumentType | null | undefined): string | null {
  if (!detected || detected === "unknown") return null
  if (detected === "electricity") return "ELECTRICAL"
  if (detected === "soil_certificate") return "SOIL_CERTIFICATE"
  if (detected === "urban_planning_info") return "URBAN_PLANNING_INFO"
  return detected.toUpperCase() as "EPC" | "ASBESTOS"
}

async function resolveDocumentTypeId(
  supabase: SupabaseClient,
  detected: IntakeDetectedDocumentType | null | undefined
): Promise<string | null> {
  const name = documentTypeNameFromIntake(detected)
  if (!name) return null
  const { data, error } = await supabase.from("document_types").select("id").eq("name", name).maybeSingle()
  if (error) {
    console.warn("[documents] attach: document_types lookup failed", error.message)
    return null
  }
  return (data?.id as string) ?? null
}

function inferTypeIdFromFileName(
  fileName: string,
  rows: Array<{ id: string; name: string }>
): string | null {
  const lower = fileName.toLowerCase()
  const epc = rows.find((t) => t.name.toLowerCase().includes("epc"))
  if (epc && (lower.includes("epc") || lower.includes("peb"))) return epc.id
  const electrical = rows.find((t) => t.name.toLowerCase().includes("electrical"))
  if (electrical && lower.includes("electr")) return electrical.id
  const asbestos = rows.find((t) => t.name.toLowerCase().includes("asbestos"))
  if (asbestos && lower.includes("asbest")) return asbestos.id
  const soil = rows.find((t) => t.name === "SOIL_CERTIFICATE")
  if (soil && (lower.includes("bodem") || lower.includes("soil") || lower.includes("ovam"))) return soil.id
  const urban = rows.find((t) => t.name === "URBAN_PLANNING_INFO")
  if (
    urban &&
    (lower.includes("stedenbouw") ||
      lower.includes("stedebouw") ||
      lower.includes("urban") ||
      lower.includes("vastgoedinformatie"))
  ) {
    return urban.id
  }
  return null
}

function detectedKindToDocumentTypeName(
  kind: string
): "EPC" | "ELECTRICAL" | "ASBESTOS" | "SOIL_CERTIFICATE" | "URBAN_PLANNING_INFO" | null {
  if (kind === "epc") return "EPC"
  if (kind === "electrical") return "ELECTRICAL"
  if (kind === "asbestos") return "ASBESTOS"
  if (kind === "soil_certificate") return "SOIL_CERTIFICATE"
  if (kind === "urban_planning_info") return "URBAN_PLANNING_INFO"
  return null
}

/** Same heuristics as property upload filename hints — applied to storage path tail. */
function inferTypeIdFromStoragePath(
  storagePath: string,
  rows: Array<{ id: string; name: string }>
): string | null {
  const tail = storagePath.split("/").pop() ?? storagePath
  return inferTypeIdFromFileName(tail, rows)
}

/**
 * Read PDF text from storage and map to a `document_types` row (EPC / ELECTRICAL / ASBESTOS).
 */
async function inferDocumentTypeIdFromPdfStorage(
  supabase: SupabaseClient,
  storagePath: string
): Promise<string | null> {
  try {
    const { data: blob, error: dlErr } = await supabase.storage.from("documents").download(storagePath)
    if (dlErr || !blob) return null

    const buffer = Buffer.from(await blob.arrayBuffer())
    let text = ""
    try {
      text = (await extractTextFromPDF(buffer)).text
    } catch {
      try {
        text = (await extractTextFromPDFFallback(buffer)).text
      } catch {
        return null
      }
    }

    const kind = detectDocumentTypeFromPdfText(text.slice(0, 25_000))
    const typeName = detectedKindToDocumentTypeName(kind)
    if (!typeName) return null

    const { data, error } = await supabase.from("document_types").select("id").eq("name", typeName).maybeSingle()
    if (error) return null
    return (data?.id as string) ?? null
  } catch (e) {
    console.warn("[documents] attach: PDF-based type inference failed", e)
    return null
  }
}

/** Last resort so the row always participates in verification UI (analysis may flag wrong-type). */
async function fallbackDefaultDocumentTypeId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("document_types").select("id").eq("name", "EPC").maybeSingle()
  return (data?.id as string) ?? null
}

async function resolveDocumentTypeNameById(
  supabase: SupabaseClient,
  typeId: string | null
): Promise<string | null> {
  if (!typeId) return null
  const { data, error } = await supabase.from("document_types").select("name").eq("id", typeId).maybeSingle()
  if (error) {
    console.warn("[documents] attach: document type name lookup failed", error.message)
    return null
  }
  return (data?.name as string | null) ?? null
}

function revalidatePropertyStatusPaths(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`)
  revalidatePath("/")
  revalidatePath("/map")
  revalidatePath("/analytics")
}

export type AttachDocumentToPropertyParams = {
  documentId: string
  propertyId: string
  /** Intake detection → `document_types` row so property compliance views pick up the document. */
  intakeDetectedType?: IntakeDetectedDocumentType | null
  /** Used when intake type is unknown (e.g. match `epc` from filename). */
  sourceFileName?: string | null
  /**
   * When true, run the AI pipeline immediately after attach. Default `false` so uploads do not burn
   * Gemini credits without explicit user intent — analysis is then driven by the manual Analyze button
   * via `runAnalysis`. Bulk intake and single-file uploads should leave this off.
   */
  triggerAnalysis?: boolean
}

/**
 * Ensures the row is tied to the property and resolves `document_type_id` when missing. Analysis
 * only runs when `triggerAnalysis` is `true`. Behaviour with `triggerAnalysis: true`:
 * - `done` + `result_json` → no-op (idempotent)
 * - `processing` → no-op (avoid duplicate concurrent jobs)
 * - `queued` / `error` → execute pipeline once
 */
export async function attachDocumentToProperty(
  supabase: SupabaseClient,
  params: AttachDocumentToPropertyParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { documentId, propertyId } = params
  const pid = typeof propertyId === "string" ? propertyId.trim() : ""
  if (!pid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pid)) {
    return { ok: false, error: "Cannot attach document: invalid propertyId" }
  }

  const { data: propRow, error: propErr } = await supabase.from("properties").select("id").eq("id", pid).maybeSingle()
  if (propErr || !propRow?.id) {
    return {
      ok: false,
      error:
        propErr?.message ??
        `Property ${pid} does not exist; refusing attach (prevents documents_property_id_fkey violations).`,
    }
  }

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, property_id, document_type_id, storage_path")
    .eq("id", documentId)
    .maybeSingle()

  if (docErr || !doc) {
    return { ok: false, error: docErr?.message ?? "Document not found." }
  }

  if (doc.property_id !== pid) {
    return {
      ok: false,
      error: `Document ${documentId} is not linked to property ${pid} (found ${doc.property_id}).`,
    }
  }

  let typeId = doc.document_type_id as string | null

  if (!typeId) {
    typeId = await resolveDocumentTypeId(supabase, params.intakeDetectedType ?? null)
  }

  if (!typeId && params.sourceFileName) {
    const { data: types } = await supabase.from("document_types").select("id, name")
    if (types?.length) {
      typeId = inferTypeIdFromFileName(params.sourceFileName, types as { id: string; name: string }[])
    }
  }

  if (!typeId && doc.storage_path) {
    const { data: types } = await supabase.from("document_types").select("id, name")
    if (types?.length) {
      typeId = inferTypeIdFromStoragePath(doc.storage_path as string, types as { id: string; name: string }[])
    }
  }

  if (!typeId && doc.storage_path) {
    typeId = await inferDocumentTypeIdFromPdfStorage(supabase, doc.storage_path as string)
  }

  if (!typeId) {
    typeId = await fallbackDefaultDocumentTypeId(supabase)
    if (typeId) {
      console.warn(
        "[documents] attach: could not infer document type; assigned default EPC so the file appears under Verification Documents."
      )
    }
  }

  if (typeId && !doc.document_type_id) {
    const { error: upTypeErr } = await supabase.from("documents").update({ document_type_id: typeId }).eq("id", documentId)
    if (upTypeErr) {
      console.warn("[documents] attach: failed to set document_type_id", upTypeErr.message)
    }
  }

  if (typeId) {
    const active = await setActiveDocumentVersion(supabase, {
      propertyId: pid,
      documentId,
      documentTypeId: typeId,
    })
    if (!active.ok) {
      console.warn("[documents] attach: failed to mark active document version", active.error)
    }
  }

  const { data: runs, error: runsErr } = await supabase
    .from("analysis_runs")
    .select("id, status, result_json, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)

  if (runsErr) {
    return { ok: false, error: runsErr.message }
  }

  let analysisRunId: string | null = (runs?.[0]?.id as string) ?? null
  const latest = runs?.[0] as { id: string; status: string; result_json: unknown } | undefined

  if (!analysisRunId) {
    const { data: inserted, error: insErr } = await supabase
      .from("analysis_runs")
      .insert({ document_id: documentId, status: "queued" })
      .select("id")
      .single()

    if (insErr || !inserted?.id) {
      return { ok: false, error: insErr?.message ?? "Could not create analysis run." }
    }
    analysisRunId = inserted.id as string
  } else if (latest?.status === "done" && latest.result_json != null) {
    revalidatePropertyStatusPaths(pid)
    return { ok: true }
  } else if (latest?.status === "processing") {
    return { ok: true }
  }

  if (!params.triggerAnalysis) {
    revalidatePropertyStatusPaths(pid)
    return { ok: true }
  }

  const exec = await executeAnalysisRunPipeline(supabase, {
    analysisRunId: analysisRunId!,
    documentId,
    propertyId: pid,
  })

  if ("error" in exec) {
    return { ok: false, error: exec.error }
  }

  revalidatePropertyStatusPaths(pid)
  return { ok: true }
}
