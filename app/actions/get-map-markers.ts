"use server"

import { createServerClient } from "@/lib/supabase/server"
import {
  computePropertyStatus,
  toDocumentAnalysisSummary,
  REQUIRED_DOCUMENT_TYPE_NAMES,
  type DocumentWithAnalysis,
} from "@/lib/property-status"
import { getCurrentDocumentsByType } from "@/lib/current-documents"
import { pickLatestAnalysisRun } from "@/lib/pick-latest-analysis-run"

export type MapMarkerRow = {
  propertyId: string
  displayName: string
  latitude: number
  longitude: number
  addressLabel: string
  status: "green" | "orange" | "red"
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

type AddrRow = {
  property_id: string
  latitude: number | string | null
  longitude: number | string | null
  raw_line1: string
  normalized_full_address: string | null
  street_name: string | null
  postal_code: string | null
  municipality: string | null
}

function normalizeSearchTerm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function displayNameFromMap(
  names: Map<string, string | null | undefined>,
  propertyId: string
): string {
  const n = names.get(propertyId)?.trim()
  return n || `Property ${propertyId.slice(0, 8)}`
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export async function getMapMarkers(searchQuery?: string): Promise<{
  markers: MapMarkerRow[]
  error: string | null
}> {
  try {
    const supabase = createServerClient()
    const normalizedQuery = normalizeSearchTerm(searchQuery)

    const { data: rows, error: qErr } = await supabase
      .from("property_addresses")
      .select(
        "property_id, latitude, longitude, raw_line1, normalized_full_address, street_name, postal_code, municipality"
      )

    if (qErr) {
      console.warn("[getMapMarkers] Supabase query error:", qErr.message)
      return { markers: [], error: qErr.message }
    }

    const list = (rows as AddrRow[]) || []
    const sample = list[0]
      ? {
          property_id: list[0].property_id,
          latitude: list[0].latitude,
          longitude: list[0].longitude,
          raw_line1: list[0].raw_line1?.slice(0, 80),
        }
      : null
    console.warn("[getMapMarkers] rows from Supabase:", list.length, "sample:", sample)

    const base: Omit<MapMarkerRow, "status">[] = []
    for (const row of list) {
      const lat = toNum(row.latitude)
      const lon = toNum(row.longitude)
      if (lat == null || lon == null) continue

      const addressLabel =
        row.normalized_full_address?.trim() || row.raw_line1?.trim() || "—"

      base.push({
        propertyId: row.property_id,
        displayName: "",
        latitude: lat,
        longitude: lon,
        addressLabel,
      })
    }

    console.warn("[getMapMarkers] rows after lat/lon filter:", base.length)

    if (base.length === 0) {
      console.warn("[getMapMarkers] final marker count: 0 (no coordinates)")
      return { markers: [], error: null }
    }

    const propertyIds = [...new Set(base.map((b) => b.propertyId))]

    const { data: propRows, error: propErr } = await supabase
      .from("properties")
      .select("id, display_name")
      .in("id", propertyIds)

    if (propErr) {
      console.warn("[getMapMarkers] properties lookup error:", propErr.message)
      return { markers: [], error: propErr.message }
    }

    const nameById = new Map<string, string | null | undefined>()
    for (const p of (propRows as { id: string; display_name?: string | null }[]) || []) {
      nameById.set(p.id, p.display_name)
    }

    for (const b of base) {
      b.displayName = displayNameFromMap(nameById, b.propertyId)
    }

    const [typesRes, docsRes] = await Promise.all([
      supabase.from("document_types").select("id, name").order("name"),
      supabase
        .from("documents")
        .select(
          "id, property_id, document_type_id, created_at, document_types(id, name), analysis_runs(id, status, result_json, created_at)"
        )
        .in("property_id", propertyIds)
        .order("created_at", { foreignTable: "analysis_runs", ascending: false }),
    ])

    const documentTypes = (typesRes.data as { id: string; name: string }[]) || []
    const requiredNamesSet = new Set<string>(REQUIRED_DOCUMENT_TYPE_NAMES)
    const requiredTypeIds = documentTypes
      .filter((dt) => requiredNamesSet.has(dt.name))
      .map((dt) => dt.id)

    const documents = (docsRes.data as DocumentWithRelations[]) || []

    const statusByProperty: Record<string, "green" | "orange" | "red"> = {}

    for (const pid of propertyIds) {
      const propDocs = documents.filter((d) => d.property_id === pid)
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
      const stats = computePropertyStatus(requiredTypeIds, [...byType.values()])
      statusByProperty[pid] = stats.status
    }

    let markers: MapMarkerRow[] = base.map((b) => ({
      ...b,
      status: statusByProperty[b.propertyId] ?? "orange",
    }))

    if (normalizedQuery) {
      const addrById = new Map<string, AddrRow>()
      for (const row of list) {
        addrById.set(row.property_id, row)
      }
      markers = markers.filter((marker) => {
        const addr = addrById.get(marker.propertyId)
        const haystack = [
          marker.displayName,
          marker.addressLabel,
          addr?.street_name,
          addr?.postal_code,
          addr?.municipality,
          addr?.raw_line1,
          addr?.normalized_full_address,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
    }

    console.warn("[getMapMarkers] final marker count:", markers.length)

    return { markers, error: null }
  } catch (e) {
    console.warn("[getMapMarkers] catch:", e)
    return {
      markers: [],
      error: e instanceof Error ? e.message : "Failed to load map data.",
    }
  }
}

