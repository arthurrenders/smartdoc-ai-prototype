"use server"

import { createServerClient } from "@/lib/supabase/server"

export async function getDocumentTypes() {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from("document_types")
    .select("*")
    .order("name")

  if (error) {
    return { error: error.message, data: null }
  }

  return { data, error: null }
}

export async function getDocumentsForProperty(propertyId: string) {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from("documents")
    .select(
      `
      id,
      property_id,
      document_type_id,
      storage_path,
      status,
      created_at,
      document_types (
        id,
        name
      ),
      analysis_runs (
        id,
        status,
        result_json,
        created_at
      )
    `
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "analysis_runs", ascending: false })

  if (error) {
    return { error: error.message, data: null }
  }

  return { data, error: null }
}

