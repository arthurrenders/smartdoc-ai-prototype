"use server"

import { createServerClient } from "@/lib/supabase/server"
import { labelForDocumentDateType } from "@/lib/document-dates/date-type-label"
import { pickName, pickDocTypeName } from "@/lib/supabase-helpers"
import { getOwnerPropertyIds } from "@/lib/supabase/ownership"

export type UpcomingDeadlineRow = {
  id: string
  property_id: string
  document_id: string
  date_type: string
  date_on: string
  propertyDisplayName: string | null
  documentTypeName: string | null
  labelDisplay: string
}

export async function getUpcomingDeadlines(limit = 20): Promise<{
  data: UpcomingDeadlineRow[]
  error: string | null
}> {
  try {
    const supabase = createServerClient()
    const propertyIds = await getOwnerPropertyIds(supabase)
    if (propertyIds.length === 0) return { data: [], error: null }
    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from("document_dates")
      .select(
        `
        id,
        property_id,
        document_id,
        date_type,
        date_on,
        properties ( display_name ),
        documents!inner ( is_active, document_types ( name ) )
      `
      )
      .in("property_id", propertyIds)
      .eq("documents.is_active", true)
      .gte("date_on", today)
      .order("date_on", { ascending: true })
      .limit(limit)

    if (error) {
      return { data: [], error: error.message }
    }

    const rows = (data as unknown[]) || []
    const out: UpcomingDeadlineRow[] = []

    for (const raw of rows) {
      const r = raw as {
        id: string
        property_id: string
        document_id: string
        date_type: string
        date_on: string
        properties?: unknown
        documents?: unknown
      }
      out.push({
        id: r.id,
        property_id: r.property_id,
        document_id: r.document_id,
        date_type: r.date_type,
        date_on: typeof r.date_on === "string" ? r.date_on.slice(0, 10) : String(r.date_on),
        propertyDisplayName: pickName(
          r.properties as { display_name?: string | null } | { display_name?: string | null }[] | null
        ),
        documentTypeName: pickDocTypeName(
          r.documents as { document_types?: { name?: string } | { name?: string }[] | null } | null
        ),
        labelDisplay: labelForDocumentDateType(r.date_type),
      })
    }

    return { data: out, error: null }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load deadlines.",
    }
  }
}

