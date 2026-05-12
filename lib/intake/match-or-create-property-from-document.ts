import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { extractTextFromPDF } from "@/lib/pdf/extractor"
import type { ExtractedPropertyAddress } from "@/lib/property-address/types"
import { extractBelgianAddressFromPdfText } from "@/lib/property-address/extract-from-analysis"
import { extractIntakePropertyAddressWithGemini } from "@/lib/intake/extract-address-with-gemini"
import type { IntakeDetectedDocumentType } from "@/lib/intake/types"
import {
  assertNoConflictingPropertyAddressMatch,
  fetchAllPropertyAddressesForUser,
  findUniquePropertyAddressMatch,
  findUniqueRawLineTextMatch,
  scoreForMatchTier,
  parsePartialAddressFromText,
  type DbAddressRow,
  type NormalizedAddressFields,
} from "@/lib/intake/property-address-match"
import {
  assertPropertyExistsForUser,
  findPropertyIdByOwnerDisplayName,
} from "@/lib/properties/display-name-match"
import { attachDocumentToProperty as attachDocumentToPropertyRecord } from "@/lib/documents/attach-document-to-property"
import { createProperty as createPropertyRecord } from "@/lib/properties/create-property"
import { geocodeBelgiumRawLine } from "@/lib/geocoding/nominatim-be"
import { runAndPersistPropertyLocationEnrichment } from "@/lib/location-enrichment/run-enrichment"

function isValidPropertyUuid(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export type { NormalizedAddressFields } from "@/lib/intake/property-address-match"

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

function sanitizeStorageSegment(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._-]+/g, "_")
  return base.length > 120 ? base.slice(0, 120) : base
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

function detectIntakeDocumentType(text: string, filename = ""): IntakeDetectedDocumentType {
  const t = `${filename}\n${text.slice(0, 12_000)}`.toLowerCase()
  if (t.includes("energieprestatie") || /\bepc\b/.test(t) || t.includes("energieprestatiecertificaat")) {
    return "epc"
  }
  if (t.includes("asbest")) return "asbestos"
  if (t.includes("keuring") && (t.includes("elektr") || t.includes("installatie") || t.includes("arei"))) {
    return "electricity"
  }
  // Cue-based electrical detection for inspection reports that don't use the word "keuring"
  // (e.g. "Verslagnummer … Adres installatie … DE INSTALATIE IS CONFORM").
  {
    const cues = [
      "verslagnummer",
      "adres installatie",
      "datum van onderzoek",
      "de installatie is",
      "de instalatie is",
      "aardingsweerstand",
      "differentieelschakelaar",
      "controle-organisme",
      "controleorganisme",
      "keuringsverslag",
    ]
    const hits = cues.reduce((n, c) => (t.includes(c) ? n + 1 : n), 0)
    if (hits >= 2 || (hits >= 1 && (t.includes("conform") || t.includes("arei")))) {
      return "electricity"
    }
  }
  if (
    t.includes("bodemattest") ||
    t.includes("ovam") ||
    t.includes("bodeminformatie") ||
    t.includes("grondinformatieregister")
  ) {
    return "soil_certificate"
  }
  if (
    t.includes("stedenbouwkundige inlichtingen") ||
    t.includes("stedenbouwkundig uittreksel") ||
    t.includes("stedenbouw") ||
    t.includes("vastgoedinformatie") ||
    t.includes("omgevingsvergunning")
  ) {
    return "urban_planning_info"
  }
  return "unknown"
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

  // Idempotent: a retry after a previous timeout may find the destination already populated.
  // Skip the copy in that case so the rest of the flow proceeds normally.
  const { data: existing } = await supabase.storage
    .from("documents")
    .list(`${params.propertyId}/intake`, { search: `${params.intakeUploadId}_${safe}` })
  if (existing?.some((entry) => entry.name === `${params.intakeUploadId}_${safe}`)) {
    return { destPath }
  }

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
      upsert: true,
    })
    if (upErr) {
      return { error: upErr.message }
    }
  }

  return { destPath }
}

async function insertDocumentAndAnalysis(
  supabase: SupabaseClient,
  params: {
    propertyId: string
    storagePath: string
    intakeDetectedDocumentType?: IntakeDetectedDocumentType | null
    sourceFileName?: string | null
    /** When the property was matched/auto-created FROM this document's address, pass the address pieces so the row can be pre-verified. */
    addressMatchPrefill?: {
      extractedAddress: string | null
      expectedAddress: string | null
      confidence: number
      reason: string
    } | null
  }
): Promise<{ documentId: string; analysisRunId: string } | { error: string }> {
  const pid = params.propertyId?.trim()
  if (!pid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pid)) {
    return { error: "Cannot attach document: invalid propertyId" }
  }

  const { data: propOk, error: propLookupErr } = await supabase.from("properties").select("id").eq("id", pid).maybeSingle()
  if (propLookupErr || !propOk?.id) {
    return {
      error:
        propLookupErr?.message ??
        `Cannot attach document: property ${pid} does not exist (FK documents_property_id_fkey would fail).`,
    }
  }

  const insertPayload: Record<string, unknown> = {
    property_id: pid,
    document_type_id: null,
    storage_path: params.storagePath,
    status: "uploaded",
  }

  if (params.addressMatchPrefill) {
    insertPayload.expected_property_id = pid
    insertPayload.expected_address = params.addressMatchPrefill.expectedAddress
    insertPayload.extracted_document_address = params.addressMatchPrefill.extractedAddress
    insertPayload.address_match_status = "match"
    insertPayload.address_match_confidence = params.addressMatchPrefill.confidence
    insertPayload.address_match_reason = params.addressMatchPrefill.reason
  }

  // Retry-safe: if a previous run already inserted this doc and only the patch was lost,
  // reuse the existing row instead of failing on a unique constraint.
  const { data: existingDocument } = await supabase
    .from("documents")
    .select("id")
    .eq("property_id", pid)
    .eq("storage_path", params.storagePath)
    .maybeSingle()

  let documentRow: { id: string } | null = (existingDocument as { id: string } | null) ?? null
  const documentNewlyInserted = !documentRow

  if (!documentRow) {
    const { data: inserted, error: documentError } = await supabase
      .from("documents")
      .insert(insertPayload)
      .select("id")
      .single()

    if (documentError || !inserted?.id) {
      return { error: documentError?.message ?? "document insert failed" }
    }
    documentRow = inserted as { id: string }
  }

  const document = documentRow

  // Find an existing analysis_runs row for this document before creating a new one.
  const { data: existingRun } = await supabase
    .from("analysis_runs")
    .select("id")
    .eq("document_id", document.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let analysisRunRow: { id: string } | null = (existingRun as { id: string } | null) ?? null
  let analysisError: { message: string } | null = null

  if (!analysisRunRow) {
    const { data: inserted, error } = await supabase
      .from("analysis_runs")
      .insert({
        document_id: document.id,
        status: "queued",
      })
      .select("id")
      .single()
    analysisError = error ?? null
    analysisRunRow = inserted as { id: string } | null
  }

  if (analysisError || !analysisRunRow?.id) {
    if (documentNewlyInserted) {
      await supabase.storage.from("documents").remove([params.storagePath]).catch(() => {})
      await supabase.from("documents").delete().eq("id", document.id)
    }
    return { error: analysisError?.message ?? "analysis run insert failed" }
  }

  const documentId = document.id as string
  const analysisRunId = analysisRunRow.id as string

  const attach = await attachDocumentToPropertyRecord(supabase, {
    documentId,
    propertyId: pid,
    intakeDetectedType: params.intakeDetectedDocumentType ?? null,
    sourceFileName: params.sourceFileName ?? null,
    uploadOnlyInlineComplete: true,
  })
  if (!attach.ok) {
    console.error("[intake] attachDocumentToProperty after insert:", attach.error)
  }

  return { documentId, analysisRunId }
}

async function findMatchingProperty(
  supabase: SupabaseClient,
  params: { userId: string; normalized: NormalizedAddressFields; rows?: DbAddressRow[] }
): Promise<{ propertyId: string; tier: AddressMatchTier } | null> {
  const rows = params.rows ?? (await fetchAllPropertyAddressesForUser(supabase, params.userId))
  const m = findUniquePropertyAddressMatch(params.normalized, rows)
  if (m.kind === "linked") {
    return { propertyId: m.row.property_id, tier: m.tier }
  }
  return null
}

async function createProperty(
  supabase: SupabaseClient,
  params: {
    userId: string
    displayName: string
    addressLine: string
    normalized: NormalizedAddressFields
    source: string
  }
): Promise<{ ok: true; propertyId: string; propertyAddressId: string } | { ok: false; error: string }> {
  return createPropertyRecord(supabase, {
    userId: params.userId,
    displayName: params.displayName,
    addressLine: params.addressLine,
    structuredAddress: params.normalized,
    source: params.source,
  })
}

function optionalNominatimUserAgent(): string | null {
  const ua = process.env.NOMINATIM_USER_AGENT?.trim()
  return ua && ua.length >= 8 ? ua : null
}

async function geocodeAndEnrichNewProperty(
  supabase: SupabaseClient,
  params: {
    propertyId: string
    rawLine: string
    normalized: NormalizedAddressFields
  }
): Promise<void> {
  const userAgent = optionalNominatimUserAgent()
  if (!userAgent) {
    console.warn("[intake] auto geocode skipped: NOMINATIM_USER_AGENT is not configured")
    return
  }

  const now = new Date().toISOString()
  try {
    const outcome = await geocodeBelgiumRawLine(params.rawLine, userAgent, {
      streetName: params.normalized.street_name,
      houseNumber: params.normalized.house_number,
      box: params.normalized.box,
      postalCode: params.normalized.postal_code,
      municipality: params.normalized.municipality,
      countryCode: params.normalized.country_code || "BE",
    })

    if (outcome.kind !== "ok") {
      await supabase
        .from("property_addresses")
        .update({
          geocode_status: outcome.kind === "no_result" ? "no_result" : "error",
          geocode_error: "detail" in outcome ? outcome.detail.slice(0, 500) : "Automatic geocode failed.",
          updated_at: now,
        })
        .eq("property_id", params.propertyId)
      return
    }

    const { error: upErr } = await supabase
      .from("property_addresses")
      .update({
        latitude: outcome.latitude,
        longitude: outcome.longitude,
        normalized_full_address: outcome.normalizedFullAddress,
        street_name: outcome.streetName,
        house_number: outcome.houseNumber,
        postal_code: outcome.postalCode,
        municipality: outcome.municipality,
        region: outcome.region,
        geocoded_at: now,
        geocode_status: "ok",
        geocode_error: null,
        updated_at: now,
      })
      .eq("property_id", params.propertyId)

    if (upErr) {
      console.warn("[intake] auto geocode: update failed", upErr.message)
      return
    }

    try {
      await runAndPersistPropertyLocationEnrichment(supabase, params.propertyId, userAgent)
    } catch (e) {
      console.warn("[intake] auto location enrichment failed", e)
    }
  } catch (e) {
    console.warn("[intake] auto geocode failed", e)
  }
}

async function attachDocumentToProperty(
  supabase: SupabaseClient,
  params: {
    intakeUploadId: string
    storagePath: string
    filename: string
    propertyId: string
    newPropertyIdForRollback: string | null
    intakeDetectedDocumentType: IntakeDetectedDocumentType
  }
): Promise<
  { ok: true; finalStoragePath: string; documentId: string; analysisRunId: string } | { ok: false; error: string }
> {
  if (!params.propertyId) {
    throw new Error("Invalid propertyId before attaching document")
  }
  return commitIntakePdfToProperty(supabase, params)
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
    ? detectIntakeDocumentType(text, params.filename)
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

  // Regex-first to avoid burning Gemini credits when the PDF already has a clean Belgian-style
  // address line. Only fall back to the LLM when the heuristic finds nothing — most EPC, asbestos,
  // and electrical certificates have a parseable "Street Number, 0000 Municipality" line.
  const heuristicCandidate = extractBelgianAddressFromPdfText(text)
  let geminiResult: Awaited<ReturnType<typeof extractIntakePropertyAddressWithGemini>> | null = null
  let candidate = heuristicCandidate

  if (!heuristicCandidate) {
    geminiResult = await extractIntakePropertyAddressWithGemini(text)
    candidate = geminiResult.address
  }

  const geminiAddress = geminiResult?.address ?? null
  const parsed = geminiResult?.parsed
  const debugConfidence = typeof parsed?.confidence === "number" ? parsed.confidence : 0

  if (heuristicCandidate) {
    console.info(`${logPrefix} address extraction=pdf_heuristic conf=${heuristicCandidate.confidence.toFixed(2)} (Gemini skipped)`)
  } else if (geminiResult) {
    console.info(`[AI ADDRESS EXTRACTION]
Document: ${params.filename}
Raw output: ${geminiResult.rawOutput ?? "<empty>"}
Parsed:
  Street: ${parsed?.street_name?.trim() || "<missing>"}
  Number: ${parsed?.house_number?.trim() || "<missing>"}
  City: ${parsed?.municipality?.trim() || "<missing>"}
  Postal Code: ${parsed?.postal_code !== null && parsed?.postal_code !== undefined ? String(parsed.postal_code).trim() : "<missing>"}
Confidence: ${debugConfidence}`)
    if (geminiAddress) {
      console.info(`${logPrefix} address extraction=gemini conf=${debugConfidence.toFixed(2)}`)
    }
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

  const rows = await fetchAllPropertyAddressesForUser(supabase, params.userId)
  const uniqueMatch = findUniquePropertyAddressMatch(normalized, rows)

  let chosen: DbAddressRow | null = null
  let matchTier: AddressMatchTier | null = null

  if (uniqueMatch.kind === "linked") {
    chosen = uniqueMatch.row
    matchTier = uniqueMatch.tier
    console.info(
      `${logPrefix} unified match=${uniqueMatch.tier} streetSim=${uniqueMatch.streetSimilarity.toFixed(2)} property=${chosen.property_id}`
    )
  } else if (uniqueMatch.kind === "ambiguous") {
    console.warn(
      `${logPrefix} ambiguous unified match strong=${uniqueMatch.strongCount} medium=${uniqueMatch.mediumCount}`
    )
    return {
      outcome: "needs_manual_review",
      reason: "ambiguous_match",
      confidenceScore: null,
      normalized,
      extractedAddressRaw,
      candidateCountStrong: uniqueMatch.strongCount,
      candidateCountMedium: uniqueMatch.mediumCount,
      extractedTextLength,
      detectedDocumentType,
    }
  } else {
    console.info(
      `${logPrefix} no unified property match (postal optional) postal=${normalized.postal_code} docType=${detectedDocumentType}`
    )
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
        candidateCountStrong: 0,
        candidateCountMedium: 0,
        extractedTextLength,
        detectedDocumentType,
      }
    }

    const guard = await assertNoConflictingPropertyAddressMatch(supabase, params.userId, normalized)
    if (guard.kind === "linked") {
      chosen = guard.row
      matchTier = guard.tier
      propertyId = chosen.property_id
      propertyAddressId = chosen.id
      created = false
      console.info(`${logPrefix} pre-create guard linked existing property=${propertyId}`)
    } else if (guard.kind === "ambiguous") {
      return {
        outcome: "needs_manual_review",
        reason: "ambiguous_match",
        confidenceScore: null,
        normalized,
        extractedAddressRaw,
        candidateCountStrong: guard.strongCount,
        candidateCountMedium: guard.mediumCount,
        extractedTextLength,
        detectedDocumentType,
      }
    }
  }

  if (!propertyId) {
    const displayName =
      (extractedAddressRaw && extractedAddressRaw.length <= 80
        ? extractedAddressRaw
        : `${normalized.street_name} ${normalized.house_number}, ${normalized.postal_code} ${normalized.municipality}`
      ).slice(0, 80)

    const createdProperty = await createProperty(supabase, {
      userId: params.userId,
      displayName,
      addressLine: extractedAddressRaw ?? displayName,
      normalized,
      source: "intake_auto_create",
    })

    if (!createdProperty.ok) {
      console.error(`${logPrefix} property insert failed`, createdProperty.error)
      return {
        outcome: "failed",
        reason: createdProperty.error,
        extractedTextLength,
        detectedDocumentType,
      }
    }

    propertyId = createdProperty.propertyId
    created = true
    propertyAddressId = createdProperty.propertyAddressId
    console.info(`${logPrefix} created property=${propertyId} address=${propertyAddressId}`)
    await geocodeAndEnrichNewProperty(supabase, {
      propertyId,
      rawLine: extractedAddressRaw ?? displayName,
      normalized,
    })
  }

  if (!propertyId) {
    throw new Error("Invalid propertyId before attaching document")
  }

  const copyRes = await copyIntakeToPropertyStorage(supabase, {
    sourcePath: params.storagePath,
    propertyId,
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

  const prefillReason = created
    ? "Property was auto-created from this document's address."
    : `Address matched existing property (${matchTier ?? "strong"} signal).`
  const prefillConfidence = matchTier ? scoreForMatchTier(matchTier) : Math.max(0.85, candidate.confidence)

  const docRes = await insertDocumentAndAnalysis(supabase, {
    propertyId,
    storagePath: copyRes.destPath,
    intakeDetectedDocumentType: detectedDocumentType,
    sourceFileName: params.filename,
    addressMatchPrefill: {
      extractedAddress: extractedAddressRaw,
      expectedAddress: extractedAddressRaw,
      confidence: prefillConfidence,
      reason: prefillReason,
    },
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

  // Intentionally keep the intake blob in storage until processIntakeUploads has written the
  // intake_uploads patch. If this function timed out before the patch update, removing the blob
  // here would cause the retry to fail with "could not download the file from storage".
  // Cleanup of the intake source happens in process-intake-uploads.ts after a successful patch.

  const confidenceScore = matchTier ? scoreForMatchTier(matchTier) : Math.max(0.74, candidate.confidence)

  const outcome: "linked_existing" | "created_new" = created ? "created_new" : "linked_existing"
  console.info(
    `${logPrefix} success outcome=${outcome} property=${propertyId} doc=${docRes.documentId} tier=${matchTier ?? "create"} conf=${confidenceScore.toFixed(2)}`
  )

  return {
    outcome,
    propertyId,
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

export type LinkIntakeManualPropertyParams = {
  userId: string
  intakeUploadId: string
  /** Optional label from UI; address-derived fallback is used when omitted. */
  displayName: string
  /** Free-form address line stored on `property_addresses.raw_line1`. */
  addressLine: string | null
  /** Optional direct selection from existing property dropdown. */
  selectedPropertyId?: string | null
}

/**
 * Copy intake blob → property storage, insert `documents` + `analysis_runs`, remove intake blob.
 * Sequential guarantees: document row only exists after storage copy succeeds; intake blob removed only after doc row exists.
 * @param newPropertyIdForRollback When set, delete this property (+ its address row) if copy or document insert fails.
 */
async function commitIntakePdfToProperty(
  supabase: SupabaseClient,
  args: {
    intakeUploadId: string
    storagePath: string
    filename: string
    propertyId: string
    newPropertyIdForRollback: string | null
    intakeDetectedDocumentType: IntakeDetectedDocumentType
  }
): Promise<
  { ok: true; finalStoragePath: string; documentId: string; analysisRunId: string } | { ok: false; error: string }
> {
  const copyRes = await copyIntakeToPropertyStorage(supabase, {
    sourcePath: args.storagePath,
    propertyId: args.propertyId,
    intakeUploadId: args.intakeUploadId,
    filename: args.filename,
  })

  if ("error" in copyRes) {
    if (args.newPropertyIdForRollback) {
      await supabase.from("property_addresses").delete().eq("property_id", args.newPropertyIdForRollback)
      await supabase.from("properties").delete().eq("id", args.newPropertyIdForRollback)
    }
    return { ok: false, error: `Storage: ${copyRes.error}` }
  }

  const docRes = await insertDocumentAndAnalysis(supabase, {
    propertyId: args.propertyId,
    storagePath: copyRes.destPath,
    intakeDetectedDocumentType: args.intakeDetectedDocumentType,
    sourceFileName: args.filename,
  })

  if ("error" in docRes) {
    await supabase.storage.from("documents").remove([copyRes.destPath]).catch(() => {})
    if (args.newPropertyIdForRollback) {
      await supabase.from("property_addresses").delete().eq("property_id", args.newPropertyIdForRollback)
      await supabase.from("properties").delete().eq("id", args.newPropertyIdForRollback)
    }
    return { ok: false, error: docRes.error }
  }

  await supabase.storage.from("documents").remove([args.storagePath]).catch(() => {})

  return {
    ok: true,
    finalStoragePath: copyRes.destPath,
    documentId: docRes.documentId,
    analysisRunId: docRes.analysisRunId,
  }
}

/**
 * When AI matching is inconclusive, resolve from user input using the same address matching rules as automatic intake,
 * then copy/link the PDF. Creates a property only when no confident unique match exists.
 */
export async function linkIntakeUploadToManualProperty(
  supabase: SupabaseClient,
  params: LinkIntakeManualPropertyParams
): Promise<{ ok: true; propertyId: string } | { ok: false; error: string }> {
  const fallbackLabel = (params.addressLine?.trim() || "Manual intake property").slice(0, 80)
  const label = (params.displayName.trim() || fallbackLabel).slice(0, 80)

  const { data: row, error: fetchErr } = await supabase
    .from("intake_uploads")
    .select(
      "id, user_id, processing_status, filename, storage_path, matched_property_id, created_property_id, detected_document_type"
    )
    .eq("id", params.intakeUploadId)
    .maybeSingle()

  if (fetchErr || !row) {
    return { ok: false, error: fetchErr?.message ?? "Intake upload not found." }
  }
  if (row.user_id !== params.userId) {
    return { ok: false, error: "Not allowed for this upload." }
  }

  const status = row.processing_status as string
  if (status !== "needs_review" && status !== "failed") {
    return { ok: false, error: "Manual linking is only available for items that need review or failed processing." }
  }
  if (row.matched_property_id || row.created_property_id) {
    return { ok: false, error: "This upload is already linked to a property." }
  }

  const storagePath = row.storage_path as string
  const filename = row.filename as string
  const rawLine = (params.addressLine?.trim() || label).slice(0, 500)

  const rows = await fetchAllPropertyAddressesForUser(supabase, params.userId)

  let resolvedPropertyId: string | null = null
  let matchedExisting = false
  let matchTier: AddressMatchTier | null = null

  if (params.selectedPropertyId?.trim()) {
    const chosen = params.selectedPropertyId.trim()
    const ownerOk = await assertPropertyExistsForUser(supabase, params.userId, chosen)
    if (!ownerOk) {
      return { ok: false, error: "Selected property not found or access denied." }
    }
    resolvedPropertyId = chosen
    matchedExisting = true
    matchTier = "strong"
  }

  /**
   * Manual intake used to INSERT first, then hit the unique index on lower(display_name) and surface
   * "choose a different name" — even when the user meant an existing property. We now MATCH first
   * (name, structured address, raw_line1 fuzzy) and only INSERT when no safe match exists.
   */
  const parsed =
    parsePartialAddressFromText(params.addressLine?.trim() ?? "") ?? parsePartialAddressFromText(label)

  if (parsed?.street_name && parsed?.house_number) {
    // Street + house number is the primary identity key for manual intake.
    const matched = await findMatchingProperty(supabase, {
      userId: params.userId,
      normalized: parsed,
      rows,
    })
    const m = findUniquePropertyAddressMatch(parsed, rows)
    if (matched) {
      resolvedPropertyId = matched.propertyId
      matchedExisting = true
      matchTier = matched.tier
    }
    if (m.kind === "ambiguous") {
      return {
        ok: false,
        error: `Multiple existing properties match this address (${m.strongCount} strong / ${m.mediumCount} medium signals). Add postcode and municipality, or correct the street line.`,
      }
    }
    if (!resolvedPropertyId && m.kind === "linked") {
      resolvedPropertyId = m.row.property_id
      matchedExisting = true
      matchTier = m.tier
    } else if (!resolvedPropertyId) {
      const guard = await assertNoConflictingPropertyAddressMatch(supabase, params.userId, parsed)
      if (guard.kind === "ambiguous") {
        return {
          ok: false,
          error: `Multiple existing properties match this address (${guard.strongCount} strong / ${guard.mediumCount} medium). Refine the address.`,
        }
      }
      if (guard.kind === "linked") {
        resolvedPropertyId = guard.row.property_id
        matchedExisting = true
        matchTier = guard.tier
      }
    }
  }

  if (!resolvedPropertyId) {
    const nameMatchId = await findPropertyIdByOwnerDisplayName(supabase, params.userId, label.slice(0, 80))
    if (nameMatchId) {
      resolvedPropertyId = nameMatchId
      matchedExisting = true
      matchTier = "strong"
    }
  }

  const combinedForRawLine = [params.addressLine?.trim(), label].filter(Boolean).join(" — ").slice(0, 500)
  if (!resolvedPropertyId && combinedForRawLine.trim().length >= 6) {
    const rawM = findUniqueRawLineTextMatch(combinedForRawLine, rows)
    if (rawM.kind === "ambiguous") {
      return {
        ok: false,
        error: `Several saved addresses look like this input (${rawM.strongCount} strong / ${rawM.mediumCount} medium). Add postcode and municipality or narrow the street line.`,
      }
    }
    if (rawM.kind === "linked") {
      resolvedPropertyId = rawM.row.property_id
      matchedExisting = true
      matchTier = rawM.tier
    }
  }

  let newPropertyIdForRollback: string | null = null

  if (!resolvedPropertyId) {
    const structured = parsed ?? {
      street_name: null,
      house_number: null,
      box: null,
      postal_code: null,
      municipality: null,
      country_code: "BE" as const,
    }
    const created = await createProperty(supabase, {
      userId: params.userId,
      displayName: label.slice(0, 80),
      addressLine: rawLine,
      normalized: structured,
      source: "manual_intake",
    })

    if (!created.ok) {
      const msg = created.error
      const dup =
        msg.toLowerCase().includes("unique") ||
        msg.toLowerCase().includes("duplicate")
      if (dup) {
        const existingId = await findPropertyIdByOwnerDisplayName(supabase, params.userId, label.slice(0, 80))
        if (existingId) {
          resolvedPropertyId = existingId
          matchedExisting = true
          matchTier = "strong"
        } else {
          return {
            ok: false,
            error:
              "Could not create a property and no existing property matched this name. Try again or refine the address.",
          }
        }
      } else {
        return { ok: false, error: msg }
      }
    }

    if (!resolvedPropertyId && created.ok) {
      const propertyId = created.propertyId
      newPropertyIdForRollback = propertyId

      const preCreateGuard = structured.street_name && structured.house_number
        ? await assertNoConflictingPropertyAddressMatch(supabase, params.userId, structured)
        : { kind: "none" as const }

      if (preCreateGuard.kind === "linked") {
        // If guard points to the property we just created, keep it.
        // Deleting first and then reusing that same id causes FK failures when attaching documents.
        if (preCreateGuard.row.property_id === propertyId) {
          resolvedPropertyId = propertyId
        } else {
          await supabase.from("property_addresses").delete().eq("property_id", propertyId)
          await supabase.from("properties").delete().eq("id", propertyId)
          newPropertyIdForRollback = null
          resolvedPropertyId = preCreateGuard.row.property_id
          matchedExisting = true
          matchTier = preCreateGuard.tier
        }
      } else if (preCreateGuard.kind === "ambiguous") {
        await supabase.from("property_addresses").delete().eq("property_id", propertyId)
        await supabase.from("properties").delete().eq("id", propertyId)
        return {
          ok: false,
          error: `Another property now matches this address (${preCreateGuard.strongCount} strong / ${preCreateGuard.mediumCount} medium). Refine and try again.`,
        }
      } else {
        resolvedPropertyId = propertyId
      }
    }
  }

  if (!isValidPropertyUuid(resolvedPropertyId)) {
    return { ok: false, error: "Cannot attach document: invalid propertyId" }
  }

  if (newPropertyIdForRollback && resolvedPropertyId === newPropertyIdForRollback) {
    await geocodeAndEnrichNewProperty(supabase, {
      propertyId: resolvedPropertyId,
      rawLine,
      normalized: parsed ?? {
        street_name: null,
        house_number: null,
        box: null,
        postal_code: null,
        municipality: null,
        country_code: "BE",
      },
    })
  }

  const detected = (row.detected_document_type as IntakeDetectedDocumentType | null) ?? "unknown"
  const extractedRaw = params.addressLine?.trim() || null

  const propertyIdForCommit = resolvedPropertyId

  const commit = await attachDocumentToProperty(supabase, {
    intakeUploadId: params.intakeUploadId,
    storagePath,
    filename,
    propertyId: propertyIdForCommit,
    newPropertyIdForRollback: matchedExisting ? null : newPropertyIdForRollback,
    intakeDetectedDocumentType: detected,
  })

  if (!commit.ok) {
    return { ok: false, error: commit.error }
  }

  const { error: upErr } = await supabase
    .from("intake_uploads")
    .update({
      processing_status: "processed",
      detected_document_type: detected,
      extracted_address_raw: extractedRaw,
      matched_property_id: matchedExisting ? resolvedPropertyId : null,
      created_property_id: matchedExisting ? null : resolvedPropertyId,
      confidence_score: matchTier ? scoreForMatchTier(matchTier) : null,
      needs_manual_review: false,
      error_message: null,
      storage_path: commit.finalStoragePath,
    })
    .eq("id", params.intakeUploadId)

  if (upErr) {
    console.error("[intake] manual link: intake update failed", upErr.message)
    return {
      ok: false,
      error: "The document was linked but updating the intake queue failed. Open the property from the dashboard.",
    }
  }

  return { ok: true, propertyId: propertyIdForCommit }
}
