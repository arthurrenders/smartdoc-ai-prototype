import "server-only"
import type { AnalysisResult, Flag } from "./detectors"
import { structuredAddressFromSchemaFields } from "@/lib/property-address/extract-from-analysis"
import { ELECTRICAL_PROMPT } from "@/lib/ai/prompts/electrical"
import { GEMINI_MODEL, generateContentWithRetry } from "@/lib/ai/gemini"
import { userFacingAnalysisFailureFromError } from "@/lib/ai/gemini-errors"
import {
  assertParseableJsonFromModelOutput,
  getTextFromGeminiResponse,
  parseJsonFromModelOutput,
} from "@/lib/ai/json-from-model"

const PROMPT_VERSION = "1.0"
const DEBUG_ANALYSIS_LOGS = process.env.DEBUG_ANALYSIS_LOGS === "1"

function debugLog(...args: unknown[]) {
  if (DEBUG_ANALYSIS_LOGS) console.debug(...args)
}

type ElectricalAIResponse = {
  document_type?: string
  wrong_document_type?: boolean | null
  detected_actual_document_type?: string | null
  inspection_result?: string | null
  certificate_number?: string | null
  inspection_date?: string | null
  expiry_date?: string | null
  installation_year?: number | null
  installation_type?: string | null
  is_expired?: boolean | null
  buyer_must_fix_within_18_months?: boolean | null
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

function coerceElectricalData(parsed: unknown): ElectricalAIResponse {
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

  let installation_year: number | null | undefined
  const iy = o.installation_year
  if (iy === null) installation_year = null
  else if (typeof iy === "number" && Number.isFinite(iy)) installation_year = iy
  else if (typeof iy === "string") {
    const n = parseInt(iy.replace(/\D/g, ""), 10)
    installation_year =
      Number.isFinite(n) && n >= 1800 && n <= 2100 ? n : null
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

  return {
    document_type: typeof o.document_type === "string" ? o.document_type : undefined,
    wrong_document_type: boolish(o.wrong_document_type) ?? null,
    detected_actual_document_type:
      typeof o.detected_actual_document_type === "string"
        ? o.detected_actual_document_type
        : null,
    inspection_result:
      typeof o.inspection_result === "string" ? o.inspection_result : null,
    certificate_number:
      typeof o.certificate_number === "string" ? o.certificate_number : null,
    inspection_date: typeof o.inspection_date === "string" ? o.inspection_date : null,
    expiry_date: typeof o.expiry_date === "string" ? o.expiry_date : null,
    installation_year: installation_year ?? null,
    installation_type:
      typeof o.installation_type === "string" ? o.installation_type : null,
    is_expired: boolish(o.is_expired) ?? null,
    buyer_must_fix_within_18_months:
      boolish(o.buyer_must_fix_within_18_months) ?? null,
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

export async function analyzeElectricalWithAI(
  text: string
): Promise<{ result: AnalysisResult; modelName: string; promptVersion: string }> {
  let modelName = GEMINI_MODEL

  const normalizedText = normalizeText(text)
  debugLog("=== ELECTRICAL NORMALIZED TEXT FOR AI ===")
  debugLog("Normalized text length:", normalizedText.length)
  debugLog("First 1000 chars of normalized text:", normalizedText.substring(0, 1000))
  debugLog("=== END ELECTRICAL NORMALIZED TEXT ===")

  const textToSend = normalizedText.substring(0, 12000)
  const isTruncated = normalizedText.length > 12000

  try {
    debugLog("Sending electrical text to AI (length:", textToSend.length, isTruncated ? ", truncated)" : ", full)")
    const prompt = `${ELECTRICAL_PROMPT}\n\nExtract information from this electrical inspection document:\n\n${textToSend}${
      isTruncated ? "\n\n[Document truncated for length]" : ""
    }`
    const response = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents: prompt,
    }, {
      validateText: assertParseableJsonFromModelOutput,
    })
    modelName = `${response.provider}:${response.model}`
    const content = getTextFromGeminiResponse(response)
    if (!content) {
      throw new Error("No content in electrical LLM response")
    }

    debugLog("=== RAW ELECTRICAL AI RESPONSE ===")
    debugLog(content)
    debugLog("=== END RAW ELECTRICAL AI RESPONSE ===")

    const parsed = parseJsonFromModelOutput(content)
    if (parsed !== null) {
      debugLog("=== PARSED ELECTRICAL JSON ===")
      debugLog(JSON.stringify(parsed, null, 2))
      debugLog("=== END PARSED ELECTRICAL JSON ===")
    } else {
      console.warn("Electrical AI output was not valid JSON; using empty coercion")
    }

    const electricalData = coerceElectricalData(parsed)

    debugLog("Transforming electrical AI data to analysis result...")
    const result = transformElectricalToAnalysisResult(electricalData)
    debugLog("=== FINAL ELECTRICAL ANALYSIS RESULT ===")
    debugLog(JSON.stringify(result, null, 2))
    debugLog("=== END FINAL ELECTRICAL ANALYSIS RESULT ===")

    return {
      result,
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  } catch (error) {
    console.error("Electrical AI analysis failed:", error)
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

function transformElectricalToAnalysisResult(data: ElectricalAIResponse): AnalysisResult {
  const flags: Flag[] = []
  let status: "red" | "orange" | "green" = "green"
  const summaryParts: string[] = []

  // If the AI explicitly reports a wrong document type, surface that directly
  if (data.wrong_document_type && data.red_flags && data.red_flags.includes("wrong_document_type")) {
    return {
      status: "orange",
      summary: "Verkeerd documenttype opgeladen.",
      flags: [
        {
          severity: "orange",
          title: "Verkeerd documenttype",
          details:
            "Dit bestand lijkt een ander documenttype te zijn, niet een elektrische keuring.",
        },
      ],
    }
  }

  if (data.inspection_result) {
    summaryParts.push(`Keuringsresultaat: ${data.inspection_result}`)
  }
  if (data.certificate_number) {
    summaryParts.push(`Attest: ${data.certificate_number}`)
  }
  if (data.inspection_date) {
    summaryParts.push(`Keuringsdatum: ${data.inspection_date}`)
  }
  if (data.expiry_date) {
    summaryParts.push(`Vervaldatum: ${data.expiry_date}`)
  }
  if (data.installation_year != null) {
    summaryParts.push(`Installation year: ${data.installation_year}`)
  }
  if (data.installation_type) {
    summaryParts.push(`Installation type: ${data.installation_type}`)
  }

  const redFlags = data.red_flags || []

  if (redFlags.includes("expired_certificate") || data.is_expired === true) {
    flags.push({
      severity: "red",
      title: "Expired electrical inspection certificate",
      details: `The electrical inspection certificate expired on ${data.expiry_date || "unknown date"}. A new inspection is required.`,
    })
    status = "red"
  }

  if (redFlags.includes("non_compliant_installation") || data.inspection_result === "niet-conform") {
    flags.push({
      severity: "red",
      title: "Elektrische installatie niet conform",
      details:
        "De keuring besluit dat de elektrische installatie niet conform de Belgische AREI-regels is.",
    })
    status = "red"
  }

  if (redFlags.includes("missing_certificate")) {
    flags.push({
      severity: "orange",
      title: "Missing electrical inspection certificate",
      details:
        "The installation requires an electrical inspection certificate but none was found in the document.",
    })
    if (status === "green") status = "orange"
  }

  if (redFlags.includes("missing_inspection_date") || !data.inspection_date) {
    flags.push({
      severity: "orange",
      title: "Missing inspection date",
      details: "The inspection date could not be determined from the document.",
    })
    if (status === "green") status = "orange"
  }

  if (redFlags.includes("invalid_installation_year")) {
    flags.push({
      severity: "orange",
      title: "Invalid installation year",
      details: "The installation year is missing or appears unrealistic.",
    })
    if (status === "green") status = "orange"
  }

  if (data.buyer_must_fix_within_18_months) {
    flags.push({
      severity: "orange",
      title: "Buyer must remediate within 18 months",
      details:
        "The certificate indicates that the buyer is responsible for bringing the installation into compliance within 18 months.",
    })
    if (status === "green") status = "orange"
  }

  // If we couldn't extract any of the key electrical fields, treat this as an AI failure
  const hasKeyData =
    !!data.inspection_result ||
    !!data.certificate_number ||
    !!data.inspection_date ||
    !!data.expiry_date ||
    data.installation_year != null

  if (!hasKeyData) {
    return {
      status: "orange",
      summary:
        "Elektrische keuring nagekeken - kerngegevens konden niet automatisch worden uitgelezen.",
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
    summaryParts.length > 0 ? summaryParts.join(" | ") : "Elektrische keuring geanalyseerd"

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
    inspection_date: data.inspection_date ?? null,
    expiry_date: data.expiry_date ?? null,
    is_expired: data.is_expired ?? null,
    ...(property_address ? { property_address } : {}),
  }

  return result
}

