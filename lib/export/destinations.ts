import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { Destination, ValidationRules, FieldMapping } from "./types"

export async function listEnabledDestinations(): Promise<Destination[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("export_destinations")
    .select("id, slug, name, type, output_format, validation_rules, field_mapping, enabled")
    .eq("enabled", true)
    .order("name", { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as Destination[]).map(normalizeDestination)
}

export async function getDestinationBySlug(slug: string): Promise<Destination | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("export_destinations")
    .select("id, slug, name, type, output_format, validation_rules, field_mapping, enabled")
    .eq("slug", slug)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return normalizeDestination(data as unknown as Destination)
}

function normalizeDestination(d: Destination): Destination {
  return {
    ...d,
    validation_rules: (d.validation_rules ?? {}) as ValidationRules,
    field_mapping: (d.field_mapping ?? {}) as FieldMapping,
  }
}
