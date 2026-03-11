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

export type DocumentTypeRow = { id: string; name: string }

export type PropertyStats = PropertyStatusResult

export type DashboardData = {
  properties: { id: string; created_at?: string }[]
  documentTypes: DocumentTypeRow[]
  propertyStats: Record<string, PropertyStats>
}

export async function getDashboardData(): Promise<DashboardData> {
  const { data: properties } = await getProperties()
  if (properties.length === 0) {
    return { properties: [], documentTypes: [], propertyStats: {} }
  }

  try {
    const supabase = createServerClient()
    const [typesRes, docsRes] = await Promise.all([
    supabase.from("document_types").select("id, name").order("name"),
    supabase
      .from("documents")
      .select(
        "id, property_id, document_type_id, document_types(id, name), analysis_runs(id, status, result_json)"
      )
      .in("property_id", properties.map((p) => p.id)),
  ])

  const documentTypes: DocumentTypeRow[] = (typesRes.data as DocumentTypeRow[]) || []
  const requiredNamesSet = new Set(REQUIRED_DOCUMENT_TYPE_NAMES)
  const requiredTypeIds = documentTypes
    .filter((dt) => requiredNamesSet.has(dt.name))
    .map((dt) => dt.id)
  const documents = (docsRes.data as DocumentWithRelations[]) || []

  const propertyStats: Record<string, PropertyStats> = {}

  for (const prop of properties) {
    const propDocs = documents.filter((d) => d.property_id === prop.id)
    const byType = new Map<string, DocumentWithAnalysis>()
    for (const doc of propDocs) {
      if (!doc.document_type_id || byType.has(doc.document_type_id)) continue
      const run = (doc as any).analysis_runs?.[0]
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
    documentTypes,
    propertyStats,
  }
  } catch {
    return {
      properties,
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

type DocumentWithRelations = {
  id: string
  property_id: string
  document_type_id: string | null
  analysis_runs?: Array<{ id: string; status: string; result_json?: { status?: string; expiry_date?: string } }>
}
