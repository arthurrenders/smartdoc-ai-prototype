"use server"

import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"

export type PropertyOption = {
  id: string
  display_name?: string | null
}

export type ReportRow = {
  id: string
  property_id: string
  title: string
  note_text: string
  author_name: string | null
  created_at: string
  updated_at: string
  property_display_name: string | null
}

export async function getReportsData(): Promise<{
  reports: ReportRow[]
  properties: PropertyOption[]
  error: string | null
}> {
  try {
    const supabase = createServerClient()
    const [reportsRes, propertiesRes] = await Promise.all([
      supabase
        .from("property_reports")
        .select("id, property_id, title, note_text, author_name, created_at, updated_at, properties(display_name)")
        .order("created_at", { ascending: false }),
      supabase.from("properties").select("id, display_name").order("created_at", { ascending: false }),
    ])

    if (reportsRes.error) {
      return { reports: [], properties: [], error: reportsRes.error.message }
    }
    if (propertiesRes.error) {
      return { reports: [], properties: [], error: propertiesRes.error.message }
    }

    const reports: ReportRow[] = ((reportsRes.data as any[]) ?? []).map((row) => ({
      id: row.id,
      property_id: row.property_id,
      title: row.title,
      note_text: row.note_text,
      author_name: row.author_name ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      property_display_name: row.properties?.display_name ?? null,
    }))
    const properties = ((propertiesRes.data as PropertyOption[]) ?? []).map((p) => ({
      id: p.id,
      display_name: p.display_name ?? null,
    }))

    return { reports, properties, error: null }
  } catch (error) {
    return {
      reports: [],
      properties: [],
      error: error instanceof Error ? error.message : "Failed to load reports.",
    }
  }
}

export async function createPropertyReport(formData: FormData): Promise<void> {
  const propertyId = String(formData.get("propertyId") ?? "").trim()
  const title = String(formData.get("title") ?? "").trim()
  const noteText = String(formData.get("noteText") ?? "").trim()
  const authorNameRaw = String(formData.get("authorName") ?? "").trim()
  const authorName = authorNameRaw || null

  if (!propertyId) throw new Error("Please select a property.")
  if (!title) throw new Error("Report title is required.")
  if (!noteText) throw new Error("Report note text is required.")

  const now = new Date().toISOString()
  const supabase = createServerClient()
  const { error } = await supabase.from("property_reports").insert({
    property_id: propertyId,
    title,
    note_text: noteText,
    author_name: authorName,
    created_at: now,
    updated_at: now,
  })

  if (error) {
    throw new Error(error.message ?? "Failed to create report.")
  }

  revalidatePath("/reports")
}

