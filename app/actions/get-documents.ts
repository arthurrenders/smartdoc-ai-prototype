"use server"

import { createServerClient } from "@/lib/supabase/server"
import { assertOwnerProperty } from "@/lib/supabase/ownership"

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
  await assertOwnerProperty(supabase, propertyId)

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
      expected_property_id,
      expected_address,
      extracted_document_address,
      address_match_status,
      address_match_confidence,
      address_match_reason,
      address_match_user_overridden,
      document_types (
        id,
        name
      ),
      analysis_runs (
        id,
        status,
        result_json,
        model_name,
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


