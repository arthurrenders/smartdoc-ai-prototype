"use server"

import { createServerClient } from "@/lib/supabase/server"
import { pickName, pickDocTypeName } from "@/lib/supabase-helpers"
import { getOwnerPropertyIds } from "@/lib/supabase/ownership"

export type CalendarDateEntry = {
  id: string
  property_id: string
  document_id: string
  date_type: string
  date_on: string
  source: string
  propertyDisplayName: string | null
  documentTypeName: string | null
}

export async function getCalendarDates(): Promise<{
  data: CalendarDateEntry[]
  error: string | null
}> {
  try {
    const supabase = createServerClient()
    const propertyIds = await getOwnerPropertyIds(supabase)
    if (propertyIds.length === 0) return { data: [], error: null }
    const start = new Date()
    start.setUTCFullYear(start.getUTCFullYear() - 1)
    const end = new Date()
    end.setUTCFullYear(end.getUTCFullYear() + 2)
    const isoStart = start.toISOString().slice(0, 10)
    const isoEnd = end.toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from("document_dates")
      .select(
        `
        id,
        property_id,
        document_id,
        date_type,
        date_on,
        source,
        properties ( display_name ),
        documents ( id, document_types ( name ) )
      `
      )
      .in("property_id", propertyIds)
      .gte("date_on", isoStart)
      .lte("date_on", isoEnd)
      .order("date_on", { ascending: true })

    if (error) {
      return { data: [], error: error.message }
    }

    const rows = (data as unknown[]) || []
    const out: CalendarDateEntry[] = []

    for (const raw of rows) {
      const r = raw as {
        id: string
        property_id: string
        document_id: string
        date_type: string
        date_on: string
        source: string
        properties?: unknown
        documents?: unknown
      }
      out.push({
        id: r.id,
        property_id: r.property_id,
        document_id: r.document_id,
        date_type: r.date_type,
        date_on: typeof r.date_on === "string" ? r.date_on.slice(0, 10) : String(r.date_on),
        source: r.source,
        propertyDisplayName: pickName(
          r.properties as { display_name?: string | null } | { display_name?: string | null }[] | null
        ),
        documentTypeName: pickDocTypeName(
          r.documents as Parameters<typeof pickDocTypeName>[0]
        ),
      })
    }

    return { data: out, error: null }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load calendar dates.",
    }
  }
}

