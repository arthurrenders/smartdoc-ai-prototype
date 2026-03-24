import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ExtractedDocumentDate } from "./extract-from-result"
import { labelForDocumentDateType } from "./date-type-label"

export async function replaceDocumentDatesForDocument(
  supabase: SupabaseClient,
  params: {
    propertyId: string
    documentId: string
    analysisRunId: string
    dates: ExtractedDocumentDate[]
  }
): Promise<void> {
  const { propertyId, documentId, analysisRunId, dates } = params

  const { error: delError } = await supabase.from("document_dates").delete().eq("document_id", documentId)

  if (delError) {
    console.error("document_dates delete failed:", delError)
    throw new Error(delError.message)
  }

  if (dates.length === 0) return

  const rows = dates.map((d) => ({
    property_id: propertyId,
    document_id: documentId,
    analysis_run_id: analysisRunId,
    date_type: d.date_type,
    date_on: d.date_on,
    source: d.source,
    label: labelForDocumentDateType(d.date_type),
  }))

  const { error: insError } = await supabase.from("document_dates").insert(rows)

  if (insError) {
    console.error("document_dates insert failed:", insError)
    throw new Error(insError.message)
  }
}
