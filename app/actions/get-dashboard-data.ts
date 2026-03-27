"use server"

import { createServerClient } from "@/lib/supabase/server"
import { getProperties } from "./get-properties"
import {
  computePropertyStatus,
  toDocumentAnalysisSummary,
  REQUIRED_DOCUMENT_TYPE_NAMES,
  type DocumentWithAnalysis,
  type PropertyStatusResult,
} from "@/lib/property-status"
import { getCurrentDocumentsByType } from "@/lib/current-documents"
import { pickLatestAnalysisRun } from "@/lib/pick-latest-analysis-run"

export type DocumentTypeRow = { id: string; name: string }

export type PropertyStats = PropertyStatusResult

export type DashboardData = {
  properties: { id: string; created_at?: string; display_name?: string | null }[]
  totalPropertiesCount: number
  propertiesError: string | null
  documentTypes: DocumentTypeRow[]
  propertyStats: Record<string, PropertyStats>
}

type DocumentWithRelations = {
  id: string
  property_id: string
  document_type_id: string | null
  created_at?: string | null
  analysis_runs?: Array<{
    id: string
    status: string
    created_at?: string
    result_json?: { status?: string; expiry_date?: string }
  }>
}

function normalizeSearchTerm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function matchesPropertySearch(
  query: string,
  property: { id: string; display_name?: string | null },
  address: {
    raw_line1?: string | null
    normalized_full_address?: string | null
    street_name?: string | null
    postal_code?: string | null
    municipality?: string | null
  } | null
): boolean {
  if (!query) return true
  const haystack = [
    property.display_name,
    address?.raw_line1,
    address?.normalized_full_address,
    address?.street_name,
    address?.postal_code,
    address?.municipality,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(query)
}

export async function getDashboardData(searchQuery?: string): Promise<DashboardData> {
  const { data: allProperties, error: propertiesError } = await getProperties()
  const totalPropertiesCount = allProperties.length
  let properties = allProperties

  const normalizedQuery = normalizeSearchTerm(searchQuery)
  if (properties.length === 0) {
    return {
      properties: [],
      totalPropertiesCount,
      propertiesError,
      documentTypes: [],
      propertyStats: {},
    }
  }

  try {
    const supabase = createServerClient()
    if (normalizedQuery) {
      const { data: addressRows } = await supabase
        .from("property_addresses")
        .select(
          "property_id, raw_line1, normalized_full_address, street_name, postal_code, municipality"
        )
        .in("property_id", allProperties.map((p) => p.id))

      const addressByProperty = new Map<
        string,
        {
          raw_line1?: string | null
          normalized_full_address?: string | null
          street_name?: string | null
          postal_code?: string | null
          municipality?: string | null
        }
      >()
      for (const row of addressRows ?? []) {
        const typed = row as {
          property_id: string
          raw_line1?: string | null
          normalized_full_address?: string | null
          street_name?: string | null
          postal_code?: string | null
          municipality?: string | null
        }
        addressByProperty.set(typed.property_id, typed)
      }

      properties = allProperties.filter((property) =>
        matchesPropertySearch(normalizedQuery, property, addressByProperty.get(property.id) ?? null)
      )
    }

    if (properties.length === 0) {
      return {
        properties: [],
        totalPropertiesCount,
        propertiesError: null,
        documentTypes: [],
        propertyStats: {},
      }
    }

    const [typesRes, docsRes] = await Promise.all([
    supabase.from("document_types").select("id, name").order("name"),
    supabase
      .from("documents")
      .select(
        "id, property_id, document_type_id, created_at, document_types(id, name), analysis_runs(id, status, result_json, created_at)"
      )
      .in("property_id", properties.map((p) => p.id))
      .order("created_at", { foreignTable: "analysis_runs", ascending: false }),
  ])

  const documentTypes: DocumentTypeRow[] = (typesRes.data as DocumentTypeRow[]) || []
  const requiredNamesSet = new Set<string>(REQUIRED_DOCUMENT_TYPE_NAMES)
  const requiredTypeIds = documentTypes
    .filter((dt) => requiredNamesSet.has(dt.name))
    .map((dt) => dt.id)
  const documents = (docsRes.data as DocumentWithRelations[]) || []

  const propertyStats: Record<string, PropertyStats> = {}

  for (const prop of properties) {
    const propDocs = documents.filter((d) => d.property_id === prop.id)
    const currentDocs = getCurrentDocumentsByType(propDocs)
    const byType = new Map<string, DocumentWithAnalysis>()
    for (const doc of currentDocs) {
      if (!doc.document_type_id) continue
      const run = pickLatestAnalysisRun((doc as DocumentWithRelations).analysis_runs)
      byType.set(doc.document_type_id, {
        documentTypeId: doc.document_type_id,
        analysis: toDocumentAnalysisSummary(run?.result_json),
      })
    }
    const documentsWithAnalysis = [...byType.values()]
    propertyStats[prop.id] = computePropertyStatus(requiredTypeIds, documentsWithAnalysis)
  }

  return {
    properties,
    totalPropertiesCount,
    propertiesError: null,
    documentTypes,
    propertyStats,
  }
  } catch {
    return {
      properties,
      totalPropertiesCount,
      propertiesError: null,
      documentTypes: [],
      propertyStats: Object.fromEntries(
        properties.map((p) => [
          p.id,
          {
            missingCount: 0,
            expiriesCount: 0,
            status: "orange" as const,
            documentCount: 0,
          },
        ])
      ),
    }
  }
}
