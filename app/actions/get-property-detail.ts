"use server"

import { createServerClient } from "@/lib/supabase/server"
import {
  computePropertyStatus,
  toDocumentAnalysisSummary,
  REQUIRED_DOCUMENT_TYPE_NAMES,
  type DocumentWithAnalysis,
  type PropertyStatusResult,
} from "@/lib/property-status"
import { aggregatePropertyFlags } from "@/lib/aggregate-property-flags"
import { getCurrentDocumentsByType } from "@/lib/current-documents"
import { pickLatestAnalysisRun } from "@/lib/pick-latest-analysis-run"
import type { PropertyAddressRecord } from "@/lib/property-address/types"
import {
  isLocationEnrichmentPayloadV1,
  type PropertyLocationEnrichmentView,
} from "@/lib/location-enrichment/types"

export type { PropertyLocationEnrichmentView }

export type FlagItem = {
  severity: "red" | "orange" | "green"
  title: string
  details: string
  documentTypeName?: string
  /** When > 1, this flag was merged from multiple documents. */
  occurrenceCount?: number
}

export type PropertySummaryCounts = {
  validCount: number
  missingCount: number
  manualReviewCount: number
  requiredTotal: number
  urgentActionNeeded: boolean
  summaryParagraph: string
}

export type SuggestedActionsData = {
  /** Single most important next step */
  primary: string
  /** Up to 3 follow-up actions, in order of priority */
  followUps: string[]
}

export type PropertyDetailData = {
  propertyId: string
  propertyDisplayName: string
  propertyAddress: PropertyAddressRecord | null
  locationEnrichment: PropertyLocationEnrichmentView | null
  stats: PropertyStatusResult
  documentTypes: { id: string; name: string }[]
  executiveSummary: string
  summaryCounts: PropertySummaryCounts
  flags: FlagItem[]
  suggestedActions: SuggestedActionsData
}

function formatPropertyDisplayName(id: string): string {
  return `Property ${id.slice(0, 8)}`
}

type DocumentWithRelations = {
  id: string
  property_id: string
  document_type_id: string | null
  created_at?: string | null
  document_types?: { id: string; name: string }
  analysis_runs?: Array<{
    id: string
    status: string
    created_at?: string
    result_json?: {
      status?: string
      expiry_date?: string | null
      summary?: string
      flags?: Array<{ severity?: string; title?: string; details?: string }>
    }
  }>
}

export async function getPropertyDetail(propertyId: string): Promise<PropertyDetailData | null> {
  try {
    const supabase = createServerClient()

    // Validate the property exists (RLS already ensures access for the current user).
    // Property display name is optional; we fall back to a generated label.
    const { data: propertyIdRow, error: propertyIdError } = await supabase
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .maybeSingle()

    if (propertyIdError || !propertyIdRow) {
      return null
    }

    let propertyDisplayName: string = formatPropertyDisplayName(propertyId)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
      const res = await fetch(
        `${supabaseUrl}/rest/v1/properties?select=display_name&id=eq.${encodeURIComponent(propertyId)}&limit=1`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      )

      if (res.ok) {
        const body = (await res.json()) as Array<{ display_name?: string | null }>
        propertyDisplayName = body?.[0]?.display_name ?? formatPropertyDisplayName(propertyId)
      }
    } catch {
      // If the schema hasn't been migrated yet, ignore and fall back.
    }
    const [typesRes, docsRes, addrRes, enrichRes] = await Promise.all([
      supabase.from("document_types").select("id, name").order("name"),
      supabase
        .from("documents")
        .select(
          "id, property_id, document_type_id, created_at, document_types(id, name), analysis_runs(id, status, result_json, created_at)"
        )
        .eq("property_id", propertyId)
        .order("created_at", { foreignTable: "analysis_runs", ascending: false }),
      supabase
        .from("property_addresses")
        .select(
          "id, property_id, source, raw_line1, normalized_full_address, street_name, house_number, box, postal_code, municipality, region, country_code, latitude, longitude, geocoded_at, geocode_status, geocode_error"
        )
        .eq("property_id", propertyId)
        .maybeSingle(),
      supabase
        .from("property_location_enrichment")
        .select("property_id, layer, status, error_message, payload, enriched_at")
        .eq("property_id", propertyId)
        .maybeSingle(),
    ])

    const documentTypes = (typesRes.data as { id: string; name: string }[]) || []
    const requiredNamesSet = new Set<string>(REQUIRED_DOCUMENT_TYPE_NAMES)
    const requiredTypeIds = documentTypes
      .filter((dt) => requiredNamesSet.has(dt.name))
      .map((dt) => dt.id)
    const documents = (docsRes.data as unknown as DocumentWithRelations[]) || []
    const currentDocuments = getCurrentDocumentsByType(documents)

    const byType = new Map<string, DocumentWithAnalysis>()
    for (const doc of currentDocuments) {
      if (!doc.document_type_id) continue
      const run = pickLatestAnalysisRun((doc as DocumentWithRelations).analysis_runs)
      byType.set(doc.document_type_id, {
        documentTypeId: doc.document_type_id,
        analysis: toDocumentAnalysisSummary(run?.result_json),
      })
    }
    const documentsWithAnalysis = [...byType.values()]
    const stats = computePropertyStatus(requiredTypeIds, documentsWithAnalysis)

    const summaryParts: string[] = []
    const manualReviewTypeIds = new Set<string>()
    const perDocumentFlags: Array<{ documentTypeName: string; documentId: string; flags: Array<{ severity: "red" | "orange" | "green"; title: string; details: string }> }> = []

    for (const doc of currentDocuments) {
      const run = pickLatestAnalysisRun((doc as DocumentWithRelations).analysis_runs)
      const result = run?.result_json
      const typeName = (doc as any).document_types?.name ?? "Document"
      if (result?.summary) {
        summaryParts.push(`${typeName}: ${result.summary}`)
        const s = (result.summary as string).toLowerCase()
        if (
          s.includes("manual review") ||
          s.includes("wrong document type") ||
          s.includes("ai analysis failed")
        ) {
          if (doc.document_type_id) manualReviewTypeIds.add(doc.document_type_id)
        }
      }
      const resultFlags = result?.flags
      const docFlags: Array<{ severity: "red" | "orange" | "green"; title: string; details: string }> = []
      if (Array.isArray(resultFlags)) {
        for (const f of resultFlags) {
          docFlags.push({
            severity:
              f.severity === "red" || f.severity === "orange" || f.severity === "green"
                ? f.severity
                : "orange",
            title: f.title ?? "Issue",
            details: f.details ?? "",
          })
        }
      }
      perDocumentFlags.push({
        documentTypeName: typeName,
        documentId: (doc as any).id,
        flags: docFlags,
      })
    }

    const flags = aggregatePropertyFlags(perDocumentFlags)

    const executiveSummary =
      summaryParts.length > 0
        ? summaryParts.join(" ")
        : "No document analyses available yet. Upload and run analysis for each required document type."

    const requiredTotal = requiredTypeIds.length
    const validCount = documentsWithAnalysis.filter((d) => d.analysis?.status === "green").length
    const summaryCounts: PropertySummaryCounts = {
      validCount,
      missingCount: stats.missingCount,
      manualReviewCount: manualReviewTypeIds.size,
      requiredTotal,
      urgentActionNeeded: stats.status === "red",
      summaryParagraph: buildSummaryParagraph({
        validCount,
        missingCount: stats.missingCount,
        manualReviewCount: manualReviewTypeIds.size,
        requiredTotal,
        urgentActionNeeded: stats.status === "red",
      }),
    }

    const suggestedActions = buildSuggestedActions(stats, flags)

    const propertyAddress: PropertyAddressRecord | null = (() => {
      if (addrRes.error || !addrRes.data) return null
      const raw = addrRes.data as PropertyAddressRecord
      return {
        ...raw,
        geocode_status: raw.geocode_status ?? "pending",
        geocode_error: raw.geocode_error ?? null,
      }
    })()

    const locationEnrichment: PropertyLocationEnrichmentView | null = (() => {
      if (enrichRes.error || !enrichRes.data) return null
      const row = enrichRes.data as {
        layer?: string
        status?: string
        error_message?: string | null
        payload?: unknown
        enriched_at?: string
      }
      const rawPayload = row.payload
      const payload = isLocationEnrichmentPayloadV1(rawPayload) ? rawPayload : null
      return {
        status: row.status ?? "unknown",
        layer: row.layer ?? "location_v1",
        error_message: row.error_message ?? null,
        enriched_at: row.enriched_at ?? "",
        payload,
      }
    })()

    return {
      propertyId,
      propertyDisplayName,
      propertyAddress,
      locationEnrichment,
      stats,
      documentTypes,
      executiveSummary,
      summaryCounts,
      flags,
      suggestedActions,
    }
  } catch {
    return null
  }
}

function buildSummaryParagraph(counts: {
  validCount: number
  missingCount: number
  manualReviewCount: number
  requiredTotal: number
  urgentActionNeeded: boolean
}): string {
  const { validCount, missingCount, manualReviewCount, requiredTotal, urgentActionNeeded } = counts
  if (requiredTotal === 0) {
    return "No required document types are configured."
  }
  if (validCount === requiredTotal && missingCount === 0 && manualReviewCount === 0) {
    return `All ${requiredTotal} required document${requiredTotal !== 1 ? "s" : ""} are present and valid. No action required.`
  }
  if (urgentActionNeeded) {
    const parts: string[] = []
    if (missingCount > 0) parts.push(`${missingCount} missing`)
    if (manualReviewCount > 0) parts.push(`${manualReviewCount} requiring manual review`)
    return `Urgent action required: ${parts.join(", ")}. Address these issues before closing the transaction.`
  }
  const parts: string[] = []
  if (validCount > 0) parts.push(`${validCount} valid`)
  if (missingCount > 0) parts.push(`${missingCount} missing`)
  if (manualReviewCount > 0) parts.push(`${manualReviewCount} need manual review`)
  return `${parts.join(", ")}. Review suggested actions below.`
}

function buildSuggestedActions(
  stats: PropertyStatusResult,
  flags: FlagItem[]
): SuggestedActionsData {
  const list: string[] = []
  const hasRed = flags.some((f) => f.severity === "red")
  const hasWrongDocType = flags.some(
    (f) =>
      f.title.toLowerCase().includes("wrong document type") ||
      f.details.toLowerCase().includes("wrong document")
  )
  const hasManualReview = flags.some(
    (f) =>
      f.title.toLowerCase().includes("manual review") ||
      f.details.toLowerCase().includes("manual review")
  )
  const hasAsbestosRisk = flags.some(
    (f) =>
      (f.documentTypeName?.toLowerCase().includes("asbestos") && f.severity !== "green") ||
      f.title.toLowerCase().includes("asbestos")
  )
  const hasExpiredEpc = flags.some(
    (f) =>
      (f.documentTypeName === "EPC" && f.severity === "red") ||
      f.title.toLowerCase().includes("expired")
  )
  const hasOrange = flags.some((f) => f.severity === "orange")

  if (hasRed) {
    list.push("Address critical issues before closing the transaction.")
  }
  if (stats.missingCount > 0) {
    list.push("Request missing document(s) from the seller (EPC, Asbestos, or Electrical certificate as applicable).")
  }
  if (stats.expiriesCount > 0) {
    list.push("Renew expired certificate(s) or schedule renewal before validity end.")
  }
  if (hasExpiredEpc && !list.some((s) => s.toLowerCase().includes("renew"))) {
    list.push("Renew expired EPC.")
  }
  if (hasWrongDocType) {
    list.push("Review wrong document type upload and request the correct certificate.")
  }
  if (hasManualReview && !hasWrongDocType) {
    list.push("Manually validate unclear analysis result and request correct document if needed.")
  }
  if (hasAsbestosRisk && !list.some((s) => s.toLowerCase().includes("asbestos"))) {
    list.push("Follow up on asbestos risk findings with a specialist or seller.")
  }
  if (hasOrange && !hasRed && !list.length) {
    list.push("Review warnings and follow up with the seller or a specialist if needed.")
  }
  if (list.length === 0) {
    list.push("All documents are in order. No action required.")
  }

  const primary = list[0] ?? "Review document status."
  const followUps = list.slice(1, 4)
  return { primary, followUps }
}
