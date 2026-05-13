"use server"

import { createServerClient } from "@/lib/supabase/server"
import { labelForDocumentDateType } from "@/lib/document-dates/date-type-label"
import { pickName, pickDocTypeName } from "@/lib/supabase-helpers"
import { tryGetOwnerPropertyIds } from "@/lib/supabase/ownership"
import { getCurrentDocumentsByType } from "@/lib/current-documents"

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
    const propertyIds = await tryGetOwnerPropertyIds(supabase)
    if (propertyIds.length === 0) return { data: [], error: null }
    const today = new Date().toISOString().slice(0, 10)

    const [datesRes, docsRes] = await Promise.all([
      supabase
        .from("document_dates")
        .select(
          `
          id,
          property_id,
          document_id,
          date_type,
          date_on,
          properties ( display_name ),
          documents!inner ( id, document_type_id, created_at, document_types ( name ) )
        `
        )
        .in("property_id", propertyIds)
        .gte("date_on", today)
        .order("date_on", { ascending: true }),
      supabase
        .from("documents")
        .select("id, property_id, document_type_id, created_at")
        .in("property_id", propertyIds),
    ])

    if (datesRes.error) {
      return { data: [], error: datesRes.error.message }
    }
    if (docsRes.error) {
      return { data: [], error: docsRes.error.message }
    }

    const docRows =
      (docsRes.data as Array<{
        id: string
        property_id: string
        document_type_id: string | null
        created_at?: string | null
      }> | null) ?? []
    const docsByProperty = new Map<string, typeof docRows>()
    for (const doc of docRows) {
      const list = docsByProperty.get(doc.property_id) ?? []
      list.push(doc)
      docsByProperty.set(doc.property_id, list)
    }
    const currentDocIds = new Set<string>()
    for (const list of docsByProperty.values()) {
      for (const doc of getCurrentDocumentsByType(list)) {
        currentDocIds.add(doc.id)
      }
    }

    const rows = (datesRes.data as unknown[]) || []
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
      if (!currentDocIds.has(r.document_id)) continue
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
      if (out.length >= limit) break
    }

    return { data: out, error: null }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load deadlines.",
    }
  }
}

