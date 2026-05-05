"use server"

import { createServerClient } from "@/lib/supabase/server"
import { getAppointments } from "@/app/actions/get-appointments"
import { labelForDocumentDateType } from "@/lib/document-dates/date-type-label"
import { formatTimeRange } from "@/lib/date-formatting"
import { pickDocTypeName } from "@/lib/supabase-helpers"
import { assertOwnerProperty } from "@/lib/supabase/ownership"

export type TimelineEvent =
  | {
      kind: "document"
      date: string
      id: string
      filename: string
      docTypeName: string | null
    }
  | {
      kind: "appointment"
      date: string
      id: string
      title: string
      timeRange: string
      clientName: string | null
      location: string | null
      description: string | null
      startAt: string
      endAt: string
      clientEmail: string | null
      clientPhone: string | null
      propertyId: string | null
    }
  | {
      kind: "deadline"
      date: string
      id: string
      dateType: string
      labelDisplay: string
      documentTypeName: string | null
      documentId: string
    }

type RawDocument = {
  id: string
  filename?: string | null
  storage_path?: string | null
  created_at?: string | null
  document_types?: { name?: string } | { name?: string }[] | null
}

type RawDeadline = {
  id: string
  date_type: string
  date_on: string
  document_id: string
  documents?: { document_types?: { name?: string } | { name?: string }[] | null }
    | { document_types?: { name?: string } | { name?: string }[] | null }[]
    | null
}

export async function getPropertyTimeline(propertyId: string): Promise<{
  data: TimelineEvent[]
  error: string | null
}> {
  try {
    const supabase = createServerClient()
    await assertOwnerProperty(supabase, propertyId)

    const [docsRes, deadlinesRes, appointmentsRes] = await Promise.all([
      supabase
        .from("documents")
        .select("id, storage_path, created_at, document_types(name)")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("document_dates")
        .select("id, date_type, date_on, document_id, documents(document_types(name))")
        .eq("property_id", propertyId)
        .order("date_on", { ascending: false }),
      getAppointments({ propertyId }),
    ])

    const events: TimelineEvent[] = []
    const firstError = docsRes.error ?? deadlinesRes.error ?? null

    // Documents
    for (const raw of (docsRes.data as unknown as RawDocument[]) ?? []) {
      const dateStr = raw.created_at?.slice(0, 10)
      if (!dateStr) continue
      const filename = raw.storage_path?.split("/").pop() ?? raw.id
      events.push({
        kind: "document",
        date: dateStr,
        id: raw.id,
        filename,
        docTypeName: pickDocTypeName(raw as { document_types?: { name?: string } | { name?: string }[] | null }),
      })
    }

    // Deadlines
    for (const raw of (deadlinesRes.data as unknown as RawDeadline[]) ?? []) {
      events.push({
        kind: "deadline",
        date: raw.date_on.slice(0, 10),
        id: raw.id,
        dateType: raw.date_type,
        labelDisplay: labelForDocumentDateType(raw.date_type),
        documentTypeName: pickDocTypeName(raw.documents),
        documentId: raw.document_id,
      })
    }

    // Appointments
    for (const a of appointmentsRes.data) {
      events.push({
        kind: "appointment",
        date: a.start_at.slice(0, 10),
        id: a.id,
        title: a.title,
        timeRange: formatTimeRange(a.start_at, a.end_at),
        clientName: a.client_name,
        location: a.location,
        description: a.description,
        startAt: a.start_at,
        endAt: a.end_at,
        clientEmail: a.client_email,
        clientPhone: a.client_phone,
        propertyId: a.property_id,
      })
    }

    // Sort: most recent first. Future deadlines stay at the top.
    events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

    return { data: events, error: firstError?.message ?? appointmentsRes.error }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load timeline.",
    }
  }
}

