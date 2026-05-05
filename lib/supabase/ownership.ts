import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"

export async function getOwnerUserId(supabase: SupabaseClient): Promise<string> {
  return resolveOwnerUserId(supabase as Parameters<typeof resolveOwnerUserId>[0])
}

export async function getOwnerPropertyIds(supabase: SupabaseClient): Promise<string[]> {
  const userId = await getOwnerUserId(supabase)
  const { data, error } = await supabase.from("properties").select("id").eq("user_id", userId)
  if (error) throw new Error(error.message)
  return ((data as Array<{ id: string }> | null) ?? []).map((row) => row.id)
}

export async function assertOwnerProperty(
  supabase: SupabaseClient,
  propertyId: string
): Promise<{ ownerUserId: string }> {
  const ownerUserId = await getOwnerUserId(supabase)
  const { data, error } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("user_id", ownerUserId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("Property not found.")
  return { ownerUserId }
}

export async function assertOwnerAppointment(
  supabase: SupabaseClient,
  appointmentId: string
): Promise<{ ownerUserId: string; propertyId: string | null }> {
  const ownerUserId = await getOwnerUserId(supabase)
  const { data, error } = await supabase
    .from("appointments")
    .select("id, property_id")
    .eq("id", appointmentId)
    .eq("user_id", ownerUserId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("Appointment not found.")
  return {
    ownerUserId,
    propertyId: (data as { property_id?: string | null }).property_id ?? null,
  }
}

export async function assertOwnerDocument(
  supabase: SupabaseClient,
  documentId: string,
  propertyId?: string
): Promise<{ ownerUserId: string; propertyId: string }> {
  const ownerUserId = await getOwnerUserId(supabase)
  let query = supabase
    .from("documents")
    .select("id, property_id, properties!inner(user_id)")
    .eq("id", documentId)
    .eq("properties.user_id", ownerUserId)

  if (propertyId) query = query.eq("property_id", propertyId)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Document not found.")
  return {
    ownerUserId,
    propertyId: (data as { property_id: string }).property_id,
  }
}
