import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { assertOwnerProperty } from "@/lib/supabase/ownership"
import type {
  DocumentForExport,
  PropertyAddress,
  PropertyExportContext,
  PropertyMetadata,
} from "./types"

type DocRow = {
  id: string
  storage_path: string
  status: string
  is_active?: boolean | null
  document_types: { name: string } | { name: string }[] | null
  analysis_runs:
    | {
        id: string
        status: string
        result_json: Record<string, unknown> | null
        created_at: string
      }[]
    | null
}

export async function loadPropertyExportContext(propertyId: string): Promise<PropertyExportContext> {
  const supabase = createServerClient()
  await assertOwnerProperty(supabase, propertyId)

  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select(
      "id, display_name, construction_year, transaction_type, heating_type, property_type, asking_price, bedrooms, living_area_m2, description",
    )
    .eq("id", propertyId)
    .maybeSingle()
  if (propErr) throw new Error(propErr.message)
  if (!property) throw new Error("Property not found.")

  const { data: address, error: addrErr } = await supabase
    .from("property_addresses")
    .select(
      "street_name, house_number, box, postal_code, municipality, region, country_code, normalized_full_address, raw_line1, latitude, longitude",
    )
    .eq("property_id", propertyId)
    .maybeSingle()
  if (addrErr) throw new Error(addrErr.message)

  const { data: docs, error: docErr } = await supabase
    .from("documents")
    .select(
      "id, storage_path, status, is_active, document_types(name), analysis_runs(id, status, result_json, created_at)",
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "analysis_runs", ascending: false })
  if (docErr) throw new Error(docErr.message)

  const documents: DocumentForExport[] = ((docs as DocRow[] | null) ?? [])
    .filter((row) => row.is_active !== false)
    .map((row) => {
    const dt = Array.isArray(row.document_types) ? row.document_types[0] : row.document_types
    const latestRun = (row.analysis_runs ?? [])[0]
    return {
      id: row.id,
      storage_path: row.storage_path,
      status: row.status,
      document_type_name: dt?.name ?? null,
      analysis_result:
        latestRun && latestRun.status === "done" && latestRun.result_json
          ? (latestRun.result_json as Record<string, unknown>)
          : null,
    }
  })

  return {
    property: property as PropertyMetadata,
    address: (address as PropertyAddress | null) ?? null,
    documents,
  }
}
