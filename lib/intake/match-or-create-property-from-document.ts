import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { extractTextFromPDF } from "@/lib/pdf/extractor"
import type { ExtractedPropertyAddress } from "@/lib/property-address/types"
import { extractBelgianAddressFromPdfText } from "@/lib/property-address/extract-from-analysis"
import { extractIntakePropertyAddressWithGemini } from "@/lib/intake/extract-address-with-gemini"
import { geocodeResetPatch } from "@/lib/property-address/geocode-reset"
import type { IntakeDetectedDocumentType } from "@/lib/intake/types"

/** Structured address after normalization (Belgium-first). */
export type NormalizedAddressFields = {
  street_name: string | null
  house_number: string | null
  box: string | null
  postal_code: string | null
  municipality: string | null
  country_code: string
}

export type AddressMatchTier = "strong" | "medium"

export type MatchOrCreatePropertyOutcome =
  | "linked_existing"
  | "created_new"
  | "needs_manual_review"
  | "failed"

export type MatchOrCreatePropertySuccess = {
  outcome: "linked_existing" | "created_new"
  propertyId: string
  propertyAddressId: string | null
  documentId: string
  analysisRunId: string
  finalStoragePath: string
  matchTier: AddressMatchTier | null
  confidenceScore: number
  normalized: NormalizedAddressFields
  extractedAddressRaw: string | null
  extractedTextLength: number
  detectedDocumentType: IntakeDetectedDocumentType
}

export type MatchOrCreatePropertyReview = {
  outcome: "needs_manual_review"
  reason:
    | "no_address_in_text"
    | "ambiguous_match"
    | "extraction_insufficient_for_autocreate"
    | "pdf_text_empty"
    | "pdf_download_failed"
  confidenceScore: number | null
  normalized: NormalizedAddressFields | null
  extractedAddressRaw: string | null
  candidateCountStrong: number
  candidateCountMedium: number
  extractedTextLength: number
  detectedDocumentType: IntakeDetectedDocumentType
}

export type MatchOrCreatePropertyFailure = {
  outcome: "failed"
  reason: string
  extractedTextLength: number
  detectedDocumentType?: IntakeDetectedDocumentType
}

export type MatchOrCreatePropertyResult =
  | MatchOrCreatePropertySuccess
  | MatchOrCreatePropertyReview
  | MatchOrCreatePropertyFailure

type DbAddressRow = {
  id: string
  property_id: string
  street_name: string | null
  house_number: string | null
  box: string | null
  postal_code: string | null
  municipality: string | null
  country_code: string | null
}

function sanitizeStorageSegment(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._-]+/g, "_")
  return base.length > 120 ? base.slice(0, 120) : base
}

function normStr(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normHouse(s: string | null | undefined): string {
  return normStr(s).replace(/\s/g, "")
}

function stripPunct(s: string | null | undefined): string {
  return normStr(s).replace(/[^a-z0-9]/g, "")
}

function municipalityClose(a: string | null, b: string | null): boolean {
  const na = normStr(a)
  const nb = normStr(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true
  return false
}

function streetStrongEq(
  aStreet: string | null,
  aHouse: string | null,
  bStreet: string | null,
  bHouse: string | null
): boolean {
  return normStr(aStreet) === normStr(bStreet) && normHouse(aHouse) === normHouse(bHouse)
}

function streetMediumFuzzy(aStreet: string | null, bStreet: string | null): boolean {
  const fa = stripPunct(aStreet)
  const fb = stripPunct(bStreet)
  if (!fa || !fb) return false
  if (fa === fb) return true
  if (fa.length > 4 && fb.length > 4 && (fa.includes(fb) || fb.includes(fa))) return true
  return false
}

function boxCompatible(extracted: string | null, db: string | null): boolean {
  const e = normStr(extracted)
  const d = normStr(db)
  if (!e) return true
  if (!d) return true
  return e === d
}

export function normalizeExtractedAddress(
  candidate: ExtractedPropertyAddress,
  countryCode = "BE"
): NormalizedAddressFields {
  return {
    street_name: candidate.street_name?.trim() || null,
    house_number: candidate.house_number?.trim() || null,
    box: candidate.box?.trim() || null,
    postal_code: candidate.postal_code?.trim() || null,
    municipality: candidate.municipality?.trim() || null,
    country_code: countryCode,
  }
}

function scoreForTier(tier: AddressMatchTier): number {
  return tier === "strong" ? 0.92 : 0.78
}

function detectIntakeDocumentType(text: string): "epc" | "electricity" | "asbestos" | "unknown" {
  const t = text.slice(0, 12_000).toLowerCase()
  if (t.includes("energieprestatie") || /\bepc\b/.test(t) || t.includes("energieprestatiecertificaat")) {
    return "epc"
  }
  if (t.includes("asbest")) return "asbestos"
  if (t.includes("keuring") && (t.includes("elektr") || t.includes("installatie") || t.includes("arei"))) {
    return "electricity"
  }
  return "unknown"
}

async function fetchOwnerPropertyIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("properties").select("id").eq("user_id", userId)
  if (error) {
    console.error("[intake] matchOrCreate: list properties failed", error.message)
    return []
  }
  return (data ?? []).map((r) => r.id as string)
}

async function fetchAddressCandidates(
  supabase: SupabaseClient,
  propertyIds: string[],
  postalFilter: string | null
): Promise<DbAddressRow[]> {
  if (!propertyIds.length) return []

  let q = supabase
    .from("property_addresses")
    .select("id, property_id, street_name, house_number, box, postal_code, municipality, country_code")
    .in("property_id", propertyIds)

  if (postalFilter && /^[1-9]\d{3}$/.test(postalFilter)) {
    q = q.eq("postal_code", postalFilter)
  }

  const { data, error } = await q
  if (error) {
    console.error("[intake] matchOrCreate: load property_addresses failed", error.message)
    return []
  }
  return (data as DbAddressRow[]) ?? []
}

function classifyMatches(
  extracted: NormalizedAddressFields,
  rows: DbAddressRow[]
): { strong: DbAddressRow[]; medium: DbAddressRow[] } {
  const strong: DbAddressRow[] = []
  const medium: DbAddressRow[] = []

  const exPostal = extracted.postal_code
  if (!exPostal || !/^[1-9]\d{3}$/.test(exPostal)) {
    return { strong, medium }
  }

  for (const row of rows) {
    const dbPostal = row.postal_code?.trim()
    if (!dbPostal || normStr(dbPostal) !== normStr(exPostal)) continue
    if (!boxCompatible(extracted.box, row.box)) continue
    if (!normHouse(extracted.house_number) || !normHouse(row.house_number)) continue
    if (normHouse(extracted.house_number) !== normHouse(row.house_number)) continue

    if (
      streetStrongEq(extracted.street_name, extracted.house_number, row.street_name, row.house_number) &&
      municipalityClose(extracted.municipality, row.municipality)
    ) {
      strong.push(row)
      continue
    }

    if (streetMediumFuzzy(extracted.street_name, row.street_name) && municipalityClose(extracted.municipality, row.municipality)) {
      medium.push(row)
    }
  }

  return { strong, medium }
}

function canAutoCreateProperty(n: NormalizedAddressFields): boolean {
  return Boolean(
    n.street_name?.trim() &&
      n.house_number?.trim() &&
      n.postal_code &&
      /^[1-9]\d{3}$/.test(n.postal_code) &&
      n.municipality?.trim()
  )
}

async function copyIntakeToPropertyStorage(
  supabase: SupabaseClient,
  params: { sourcePath: string; propertyId: string; intakeUploadId: string; filename: string }
): Promise<{ destPath: string } | { error: string }> {
  const safe = sanitizeStorageSegment(params.filename) || "document.pdf"
  const destPath = `${params.propertyId}/intake/${params.intakeUploadId}_${safe}`

  const { error: copyErr } = await supabase.storage.from("documents").copy(params.sourcePath, destPath)
  if (copyErr) {
    console.warn("[intake] storage.copy failed, falling back to download+upload", copyErr.message)
    const { data: blob, error: dlErr } = await supabase.storage.from("documents").download(params.sourcePath)
    if (dlErr || !blob) {
      return { error: dlErr?.message ?? "download failed" }
    }
    const buf = Buffer.from(await blob.arrayBuffer())
    const { error: upErr } = await supabase.storage.from("documents").upload(destPath, buf, {
      contentType: "application/pdf",
      upsert: false,
    })
    if (upErr) {
      return { error: upErr.message }
    }
  }

  return { destPath }
}

async function insertDocumentAndAnalysis(
  supabase: SupabaseClient,
  params: { propertyId: string; storagePath: string }
): Promise<{ documentId: string; analysisRunId: string } | { error: string }> {
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      property_id: params.propertyId,
      document_type_id: null,
      storage_path: params.storagePath,
      status: "uploaded",
    })
    .select("id")
    .single()

  if (documentError || !document?.id) {
    await supabase.storage.from("documents").remove([params.storagePath]).catch(() => {})
    return { error: documentError?.message ?? "document insert failed" }
  }

  const { data: analysisRunRow, error: analysisError } = await supabase
    .from("analysis_runs")
    .insert({
      document_id: document.id,
      status: "queued",
    })
    .select("id")
    .single()

  if (analysisError || !analysisRunRow?.id) {
    await supabase.storage.from("documents").remove([params.storagePath]).catch(() => {})
    await supabase.from("documents").delete().eq("id", document.id)
    return { error: analysisError?.message ?? "analysis run insert failed" }
  }

  return { documentId: document.id as string, analysisRunId: analysisRunRow.id as string }
}

/**
 * Download intake PDF, extract Belgian-style address, match against `property_addresses`,
 * optionally create a property, copy storage to a property-scoped path, and register `documents` + `analysis_runs`.
 *
 * Conservative: ambiguous or weak signals yield `needs_manual_review` without attaching a document.
 */
export async function matchOrCreatePropertyFromDocument(
  supabase: SupabaseClient,
  params: {
    userId: string
    intakeUploadId: string
    storagePath: string
    filename: string
  }
): Promise<MatchOrCreatePropertyResult> {
  const logPrefix = `[intake] matchOrCreate upload=${params.intakeUploadId}`
  console.info(`${logPrefix} start path=${params.storagePath}`)

  const { data: pdfBlob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(params.storagePath)

  if (downloadError || !pdfBlob) {
    console.warn(`${logPrefix} pdf download failed`, downloadError?.message)
    return {
      outcome: "needs_manual_review",
      reason: "pdf_download_failed",
      confidenceScore: null,
      normalized: null,
      extractedAddressRaw: null,
      candidateCountStrong: 0,
      candidateCountMedium: 0,
      extractedTextLength: 0,
      detectedDocumentType: "unknown",
    }
  }

  const buffer = Buffer.from(await pdfBlob.arrayBuffer())
  let text = ""
  try {
    const extracted = await extractTextFromPDF(buffer)
    text = extracted.text || ""
  } catch (e) {
    console.error(`${logPrefix} pdf text extraction threw`, e)
    return {
      outcome: "failed",
      reason: e instanceof Error ? e.message : "pdf extraction error",
      extractedTextLength: 0,
    }
  }

  const extractedTextLength = text.length
  const detectedDocumentType: IntakeDetectedDocumentType = text.trim().length
    ? detectIntakeDocumentType(text)
    : "unknown"

  if (!text.trim()) {
    console.info(`${logPrefix} no extractable text`)
    return {
      outcome: "needs_manual_review",
      reason: "pdf_text_empty",
      confidenceScore: null,
      normalized: null,
      extractedAddressRaw: null,
      candidateCountStrong: 0,
      candidateCountMedium: 0,
      extractedTextLength,
      detectedDocumentType: "unknown",
    }
  }

  const { address: geminiAddress } = await extractIntakePropertyAddressWithGemini(text)
  const candidate =
    geminiAddress ?? extractBelgianAddressFromPdfText(text)

  if (geminiAddress) {
    console.info(`${logPrefix} address extraction=gemini conf=${geminiAddress.confidence.toFixed(2)}`)
  } else if (candidate) {
    console.info(`${logPrefix} address extraction=pdf_heuristic conf=${candidate.confidence.toFixed(2)}`)
  }

  if (!candidate) {
    console.info(`${logPrefix} no address from Gemini or Belgian heuristic docType=${detectedDocumentType}`)
    return {
      outcome: "needs_manual_review",
      reason: "no_address_in_text",
      confidenceScore: null,
      normalized: null,
      extractedAddressRaw: null,
      candidateCountStrong: 0,
      candidateCountMedium: 0,
      extractedTextLength,
      detectedDocumentType,
    }
  }

  const normalized = normalizeExtractedAddress(candidate)
  const extractedAddressRaw = candidate.raw_line1?.trim() ?? null

  const propertyIds = await fetchOwnerPropertyIds(supabase, params.userId)
  const rows = await fetchAddressCandidates(supabase, propertyIds, normalized.postal_code)
  const { strong, medium } = classifyMatches(normalized, rows)

  console.info(
    `${logPrefix} candidates strong=${strong.length} medium=${medium.length} postal=${normalized.postal_code} docType=${detectedDocumentType}`
  )

  const pickUnique = (list: DbAddressRow[], tier: AddressMatchTier): DbAddressRow | null => {
    if (list.length !== 1) return null
    return list[0] ?? null
  }

  let chosen: DbAddressRow | null = null
  let matchTier: AddressMatchTier | null = null

  const strongPick = pickUnique(strong, "strong")
  if (strongPick) {
    chosen = strongPick
    matchTier = "strong"
  } else if (strong.length > 1) {
    console.warn(`${logPrefix} ambiguous strong matches (${strong.length}), skipping auto-link`)
    return {
      outcome: "needs_manual_review",
      reason: "ambiguous_match",
      confidenceScore: null,
      normalized,
      extractedAddressRaw,
      candidateCountStrong: strong.length,
      candidateCountMedium: medium.length,
      extractedTextLength,
      detectedDocumentType,
    }
  }

  if (!chosen) {
    const medPick = pickUnique(medium, "medium")
    if (medPick) {
      chosen = medPick
      matchTier = "medium"
    } else if (medium.length > 1) {
      console.warn(`${logPrefix} ambiguous medium matches (${medium.length}), skipping auto-link`)
      return {
        outcome: "needs_manual_review",
        reason: "ambiguous_match",
        confidenceScore: null,
        normalized,
        extractedAddressRaw,
        candidateCountStrong: strong.length,
        candidateCountMedium: medium.length,
        extractedTextLength,
        detectedDocumentType,
      }
    }
  }

  let propertyId: string | null = chosen?.property_id ?? null
  let propertyAddressId: string | null = chosen?.id ?? null
  let created = false

  if (!propertyId) {
    if (!canAutoCreateProperty(normalized)) {
      console.info(`${logPrefix} cannot auto-create (incomplete structured address)`)
      return {
        outcome: "needs_manual_review",
        reason: "extraction_insufficient_for_autocreate",
        confidenceScore: candidate.confidence,
        normalized,
        extractedAddressRaw,
        candidateCountStrong: strong.length,
        candidateCountMedium: medium.length,
        extractedTextLength,
        detectedDocumentType,
      }
    }

    const now = new Date().toISOString()
    const displayName =
      (extractedAddressRaw && extractedAddressRaw.length <= 80
        ? extractedAddressRaw
        : `${normalized.street_name} ${normalized.house_number}, ${normalized.postal_code} ${normalized.municipality}`
      ).slice(0, 80)

    const { data: propRow, error: propErr } = await supabase
      .from("properties")
      .insert({
        user_id: params.userId,
        display_name: displayName,
        updated_at: now,
      })
      .select("id")
      .single()

    if (propErr || !propRow?.id) {
      console.error(`${logPrefix} property insert failed`, propErr?.message)
      return {
        outcome: "failed",
        reason: propErr?.message ?? "property insert failed",
        extractedTextLength,
        detectedDocumentType,
      }
    }

    propertyId = propRow.id as string
    created = true

    const addrPayload = {
      ...geocodeResetPatch(now),
      raw_line1: (extractedAddressRaw ?? displayName).slice(0, 500),
      street_name: normalized.street_name,
      house_number: normalized.house_number,
      box: normalized.box,
      postal_code: normalized.postal_code,
      municipality: normalized.municipality,
      region: null,
      country_code: normalized.country_code,
      source: "intake_auto_create",
      created_at: now,
    }

    const { data: addrIns, error: addrErr } = await supabase
      .from("property_addresses")
      .insert({
        property_id: propertyId,
        ...addrPayload,
      })
      .select("id")
      .single()

    if (addrErr || !addrIns?.id) {
      console.error(`${logPrefix} address insert failed`, addrErr?.message)
      await supabase.from("properties").delete().eq("id", propertyId)
      return {
        outcome: "failed",
        reason: addrErr?.message ?? "address insert failed",
        extractedTextLength,
        detectedDocumentType,
      }
    }
    propertyAddressId = addrIns.id as string
    console.info(`${logPrefix} created property=${propertyId} address=${propertyAddressId}`)
  }

  const copyRes = await copyIntakeToPropertyStorage(supabase, {
    sourcePath: params.storagePath,
    propertyId: propertyId!,
    intakeUploadId: params.intakeUploadId,
    filename: params.filename,
  })

  if ("error" in copyRes) {
    console.error(`${logPrefix} storage copy failed`, copyRes.error)
    if (created && propertyId) {
      await supabase.from("property_addresses").delete().eq("property_id", propertyId)
      await supabase.from("properties").delete().eq("id", propertyId)
    }
    return {
      outcome: "failed",
      reason: `storage: ${copyRes.error}`,
      extractedTextLength,
      detectedDocumentType,
    }
  }

  const docRes = await insertDocumentAndAnalysis(supabase, {
    propertyId: propertyId!,
    storagePath: copyRes.destPath,
  })

  if ("error" in docRes) {
    console.error(`${logPrefix} document row failed`, docRes.error)
    await supabase.storage.from("documents").remove([copyRes.destPath]).catch(() => {})
    if (created && propertyId) {
      await supabase.from("property_addresses").delete().eq("property_id", propertyId)
      await supabase.from("properties").delete().eq("id", propertyId)
    }
    return {
      outcome: "failed",
      reason: docRes.error,
      extractedTextLength,
      detectedDocumentType,
    }
  }

  await supabase.storage.from("documents").remove([params.storagePath]).catch((err) => {
    console.warn(`${logPrefix} could not remove intake blob`, err)
  })

  const confidenceScore = matchTier ? scoreForTier(matchTier) : Math.max(0.74, candidate.confidence)

  const outcome: "linked_existing" | "created_new" = created ? "created_new" : "linked_existing"
  console.info(
    `${logPrefix} success outcome=${outcome} property=${propertyId} doc=${docRes.documentId} tier=${matchTier ?? "create"} conf=${confidenceScore.toFixed(2)}`
  )

  return {
    outcome,
    propertyId: propertyId!,
    propertyAddressId,
    documentId: docRes.documentId,
    analysisRunId: docRes.analysisRunId,
    finalStoragePath: copyRes.destPath,
    matchTier,
    confidenceScore,
    normalized,
    extractedAddressRaw,
    extractedTextLength,
    detectedDocumentType,
  }
}
