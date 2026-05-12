import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

export async function setActiveDocumentVersion(
  supabase: SupabaseClient,
  params: { propertyId: string; documentId: string; documentTypeId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { propertyId, documentId, documentTypeId } = params

  const { error: deactivateErr } = await supabase
    .from("documents")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("property_id", propertyId)
    .eq("document_type_id", documentTypeId)
    .neq("id", documentId)

  if (deactivateErr) {
    return { ok: false, error: deactivateErr.message }
  }

  const { error: activateErr } = await supabase
    .from("documents")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("property_id", propertyId)

  if (activateErr) {
    return { ok: false, error: activateErr.message }
  }

  return { ok: true }
}
