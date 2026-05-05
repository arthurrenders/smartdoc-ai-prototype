import "server-only"
import type { AnalysisResult, Flag } from "./detectors"
import { structuredAddressFromSchemaFields } from "@/lib/property-address/extract-from-analysis"
import { ASBEST_PROMPT as ASBESTOS_PROMPT } from "@/lib/ai/prompts/asbestos"
import { GEMINI_MODEL, generateContentWithRetry } from "@/lib/ai/gemini"
import { userFacingAnalysisFailureFromError } from "@/lib/ai/gemini-errors"
import { getTextFromGeminiResponse, parseJsonFromModelOutput } from "@/lib/ai/json-from-model"

const PROMPT_VERSION = "1.0"
const DEBUG_ANALYSIS_LOGS = process.env.DEBUG_ANALYSIS_LOGS === "1"

function debugLog(...args: unknown[]) {
  if (DEBUG_ANALYSIS_LOGS) console.debug(...args)
}

type AsbestosInventoryItem = {
  material_type?: string | null
  location?: string | null
  quantity?: number | null
  unit?: string | null
}

type AsbestosAIResponse = {
  document_type?: string
  building_year?: number | null
  certificate_number?: string | null
  certificate_date?: string | null
  expiry_date?: string | null
  asbestos_score?: string | null
  is_expired?: boolean | null
  asbestos_inventory?: AsbestosInventoryItem[] | null
  red_flags?: string[] | null
  property_street?: string | null
  property_house_number?: string | null
  property_box?: string | null
  property_postal_code?: string | null
  property_municipality?: string | null
  property_region?: string | null
}

function normalizeText(text: string): string {
  let normalized = text.replace(/\s+/g, " ")
  normalized = normalized.replace(/\n{3,}/g, "\n\n")
  normalized = normalized.trim()
  return normalized
}

function coerceAsbestosData(parsed: unknown): AsbestosAIResponse {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {}
  }
  const o = parsed as Record<string, unknown>

  const normStrings = (raw: unknown): string[] | undefined => {
    if (raw == null) return undefined
    if (!Array.isArray(raw)) return undefined
    const out: string[] = []
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) {
        out.push(item.trim())
      } else if (item && typeof item === "object") {
        const r = item as Record<string, unknown>
        const code = r.code ?? r.flag ?? r.type
        if (typeof code === "string" && code.trim()) out.push(code.trim())
      }
    }
    return out.length ? out : undefined
  }

  let building_year: number | null | undefined
  const by = o.building_year ?? o.bouwjaar_pand ?? o.build_year
  if (by === null) building_year = null
  else if (typeof by === "number" && Number.isFinite(by)) building_year = by
  else if (typeof by === "string") {
    const n = parseInt(by.replace(/\D/g, ""), 10)
    building_year =
      Number.isFinite(n) && n >= 1500 && n <= 2100 ? n : null
  }

  const normInventory = (raw: unknown): AsbestosInventoryItem[] | null | undefined => {
    if (raw == null) return undefined
    if (!Array.isArray(raw)) return undefined
    return raw.map((item) => {
      if (!item || typeof item !== "object") return {}
      const it = item as Record<string, unknown>
      let quantity: number | null | undefined
      const q = it.quantity ?? it.hoeveelheid
      if (q === null) quantity = null
      else if (typeof q === "number" && Number.isFinite(q)) quantity = q
      else if (typeof q === "string") {
        const n = parseFloat(q.replace(",", "."))
        quantity = Number.isFinite(n) ? n : null
      }
      const material =
        typeof it.material_type === "string"
          ? it.material_type
          : typeof it.type_materiaal === "string"
            ? it.type_materiaal
            : null
      const location =
        typeof it.location === "string"
          ? it.location
          : typeof it.locatie === "string"
            ? it.locatie
            : null
      const unit =
        typeof it.unit === "string"
          ? it.unit
          : typeof it.meeteenheid === "string"
            ? it.meeteenheid
            : null
      return {
        material_type: material,
        location,
        quantity: quantity ?? null,
        unit,
      }
    })
  }

  const boolish = (v: unknown): boolean | null | undefined => {
    if (v === null || v === undefined) return undefined
    if (typeof v === "boolean") return v
    if (typeof v === "string") {
      const l = v.toLowerCase()
      if (l === "true" || l === "1" || l === "yes") return true
      if (l === "false" || l === "0" || l === "no") return false
    }
    return undefined
  }

  const certNum =
    typeof o.certificate_number === "string"
      ? o.certificate_number
      : typeof o.attest_id === "string"
        ? o.attest_id
        : null
  const certDate =
    typeof o.certificate_date === "string"
      ? o.certificate_date
      : typeof o.datum_uitgifte === "string"
        ? o.datum_uitgifte
        : null
  const expiry =
    typeof o.expiry_date === "string"
      ? o.expiry_date
      : typeof o.geldig_tot === "string"
        ? o.geldig_tot
        : null
  const score =
    typeof o.asbestos_score === "string"
      ? o.asbestos_score
      : typeof o.score === "string"
        ? o.score
        : null
  const inventoryRaw = o.asbestos_inventory ?? o.inventaris

  return {
    document_type: typeof o.document_type === "string" ? o.document_type : undefined,
    building_year: building_year ?? null,
    certificate_number: certNum,
    certificate_date: certDate,
    expiry_date: expiry,
    asbestos_score: score,
    is_expired: boolish(o.is_expired) ?? null,
    asbestos_inventory: normInventory(inventoryRaw) ?? null,
    red_flags: normStrings(o.red_flags ?? o.redFlags) ?? null,
    property_street: typeof o.property_street === "string" ? o.property_street : null,
    property_house_number:
      typeof o.property_house_number === "string" ? o.property_house_number : null,
    property_box: typeof o.property_box === "string" ? o.property_box : null,
    property_postal_code:
      typeof o.property_postal_code === "string" ? o.property_postal_code : null,
    property_municipality:
      typeof o.property_municipality === "string" ? o.property_municipality : null,
    property_region: typeof o.property_region === "string" ? o.property_region : null,
  }
}

export async function analyzeAsbestosWithAI(
  text: string
): Promise<{ result: AnalysisResult; modelName: string; promptVersion: string }> {
  const modelName = GEMINI_MODEL

  const normalizedText = normalizeText(text)
  debugLog("=== ASBESTOS NORMALIZED TEXT FOR AI ===")
  debugLog("Normalized text length:", normalizedText.length)
  debugLog("First 1000 chars of normalized text:", normalizedText.substring(0, 1000))
  debugLog("=== END ASBESTOS NORMALIZED TEXT ===")

  const textToSend = normalizedText.substring(0, 12000)
  const isTruncated = normalizedText.length > 12000

  try {
    debugLog("Sending asbestos text to AI (length:", textToSend.length, isTruncated ? ", truncated)" : ", full)")
    const prompt = `${ASBESTOS_PROMPT}\n\nExtract information from this asbestos certificate:\n\n${textToSend}${
      isTruncated ? "\n\n[Document truncated for length]" : ""
    }`
    const response = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents: prompt,
    })
    const content = getTextFromGeminiResponse(response)
    if (!content) {
      throw new Error("No content in asbestos LLM response")
    }

    debugLog("=== RAW ASBESTOS AI RESPONSE ===")
    debugLog(content)
    debugLog("=== END RAW ASBESTOS AI RESPONSE ===")

    const parsed = parseJsonFromModelOutput(content)
    if (parsed !== null) {
      debugLog("=== PARSED ASBESTOS JSON ===")
      debugLog(JSON.stringify(parsed, null, 2))
      debugLog("=== END PARSED ASBESTOS JSON ===")
    } else {
      console.warn("Asbestos AI output was not valid JSON; using empty coercion")
    }

    const asbestosData = coerceAsbestosData(parsed)

    debugLog("Transforming asbestos AI data to analysis result...")
    const result = transformAsbestosToAnalysisResult(asbestosData)
    debugLog("=== FINAL ASBESTOS ANALYSIS RESULT ===")
    debugLog(JSON.stringify(result, null, 2))
    debugLog("=== END FINAL ASBESTOS ANALYSIS RESULT ===")

    return {
      result,
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  } catch (error) {
    console.error("Asbestos AI analysis failed:", error)
    const ux = userFacingAnalysisFailureFromError(error)

    const manualReviewResult: AnalysisResult = {
      status: "orange",
      summary: ux.summary,
      flags: [
        {
          severity: "orange",
          title: ux.title,
          details: ux.details,
        },
      ],
    }

    return {
      result: manualReviewResult,
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  }
}

function transformAsbestosToAnalysisResult(data: AsbestosAIResponse): AnalysisResult {
  const flags: Flag[] = []
  let status: "red" | "orange" | "green" = "green"
  const summaryParts: string[] = []

  if (data.asbestos_score) {
    summaryParts.push(`Asbestos score: ${data.asbestos_score}`)
  }
  if (data.building_year != null) {
    summaryParts.push(`Building year: ${data.building_year}`)
  }
  if (data.certificate_number) {
    summaryParts.push(`Certificate: ${data.certificate_number}`)
  }
  if (data.certificate_date) {
    summaryParts.push(`Certificate date: ${data.certificate_date}`)
  }
  if (data.expiry_date) {
    summaryParts.push(`Expiry date: ${data.expiry_date}`)
  }

  const redFlags = data.red_flags || []

  if (redFlags.includes("expired_asbestos_certificate") || data.is_expired === true) {
    flags.push({
      severity: "red",
      title: "Expired asbestos certificate",
      details: `The asbestos certificate expired on ${data.expiry_date || "unknown date"}. A new certificate is required.`,
    })
    status = "red"
  }

  if (redFlags.includes("high_risk_asbestos")) {
    flags.push({
      severity: "red",
      title: "High-risk asbestos",
      details:
        "The certificate indicates a high-risk asbestos situation (niet-asbestveilig – verhoogd risico). Immediate professional remediation is required.",
    })
    status = "red"
  }

  if (redFlags.includes("missing_required_certificate")) {
    flags.push({
      severity: "orange",
      title: "Missing required asbestos certificate",
      details:
        "The building appears to require an asbestos certificate (building year before 2001) but no valid certificate is present.",
    })
    if (status === "green") status = "orange"
  }

  if (redFlags.includes("missing_inventory")) {
    flags.push({
      severity: "orange",
      title: "Missing asbestos inventory",
      details:
        "The certificate indicates asbestos risk but does not list a detailed asbestos inventory.",
    })
    if (status === "green") status = "orange"
  }

  if (redFlags.includes("invalid_quantity")) {
    flags.push({
      severity: "orange",
      title: "Invalid asbestos quantity",
      details: "One or more asbestos materials have an invalid or non-positive quantity.",
    })
    if (status === "green") status = "orange"
  }

  const inventory = data.asbestos_inventory || []
  if (inventory.length > 0) {
    const locations = inventory
      .map((item) => item.location)
      .filter((loc): loc is string => !!loc)
    if (locations.length > 0) {
      summaryParts.push(`Asbestos locations: ${locations.join(", ")}`)
    }
  }

  // If we couldn't extract any of the key asbestos fields, treat this as an AI failure
  const hasKeyData =
    data.building_year != null ||
    !!data.certificate_number ||
    !!data.certificate_date ||
    !!data.expiry_date ||
    !!data.asbestos_score ||
    (inventory && inventory.length > 0)

  if (!hasKeyData) {
    return {
      status: "orange",
      summary:
        "Asbestos certificate reviewed — key fields were not extracted automatically.",
      flags: [
        {
          severity: "orange",
          title: "Incomplete automatic extraction",
          details:
            "The PDF text may be incomplete, scanned without OCR, or in an unexpected layout. Open the document to verify, or try a text-based export.",
        },
      ],
    }
  }

  const summary =
    summaryParts.length > 0 ? summaryParts.join(" | ") : "Asbestos certificate analyzed"

  const property_address =
    structuredAddressFromSchemaFields({
      street: data.property_street,
      house_number: data.property_house_number,
      box: data.property_box,
      postal_code: data.property_postal_code,
      municipality: data.property_municipality,
      region: data.property_region,
    }) ?? undefined

  const result: AnalysisResult = {
    status,
    summary,
    flags,
    confidence: 0.9,
    ...(property_address ? { property_address } : {}),
  }

  return result
}

