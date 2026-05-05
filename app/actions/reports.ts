"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { assertOwnerProperty, getOwnerUserId } from "@/lib/supabase/ownership"
import type { PropertyOption } from "@/lib/app-types"

export type { PropertyOption }

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
    const ownerUserId = await getOwnerUserId(supabase)
    const [reportsRes, propertiesRes] = await Promise.all([
      supabase
        .from("property_reports")
        .select("id, property_id, title, note_text, author_name, created_at, updated_at, properties!inner(display_name,user_id)")
        .eq("properties.user_id", ownerUserId)
        .order("created_at", { ascending: false }),
      supabase
        .from("properties")
        .select("id, display_name")
        .eq("user_id", ownerUserId)
        .order("created_at", { ascending: false }),
    ])

    if (reportsRes.error) {
      return { reports: [], properties: [], error: reportsRes.error.message }
    }
    if (propertiesRes.error) {
      return { reports: [], properties: [], error: propertiesRes.error.message }
    }

    type RawReport = {
      id: string
      property_id: string
      title: string
      note_text: string
      author_name: string | null
      created_at: string
      updated_at: string
      properties?: { display_name?: string | null } | { display_name?: string | null }[] | null
    }
    const reports: ReportRow[] = ((reportsRes.data as unknown as RawReport[]) ?? []).map((row) => {
      const prop = Array.isArray(row.properties) ? row.properties[0] : row.properties
      return {
        id: row.id,
        property_id: row.property_id,
        title: row.title,
        note_text: row.note_text,
        author_name: row.author_name ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        property_display_name: prop?.display_name ?? null,
      }
    })
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

const ReportFormSchema = z.object({
  propertyId: z.string().uuid("Please select a property."),
  title: z.string().trim().min(1, "Report title is required.").max(160),
  noteText: z.string().trim().min(1, "Report note text is required.").max(10000),
  authorName: z.string().trim().max(120).optional(),
})

export async function createPropertyReport(formData: FormData): Promise<void> {
  const parsed = ReportFormSchema.safeParse({
    propertyId: formData.get("propertyId"),
    title: formData.get("title"),
    noteText: formData.get("noteText"),
    authorName: formData.get("authorName"),
  })
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid report input.")
  }

  const now = new Date().toISOString()
  const supabase = createServerClient()
  await assertOwnerProperty(supabase, parsed.data.propertyId)
  const authorName = parsed.data.authorName || null
  const { error } = await supabase.from("property_reports").insert({
    property_id: parsed.data.propertyId,
    title: parsed.data.title,
    note_text: parsed.data.noteText,
    author_name: authorName,
    created_at: now,
    updated_at: now,
  })

  if (error) {
    throw new Error(error.message ?? "Failed to create report.")
  }

  revalidatePath("/reports")
}


