import "server-only"
import { type EPCResponse, normalizeParsedEpcResponse } from "./epc-schema"
import { EPC_PROMPT } from "@/lib/ai/prompts/epc"
import type { AnalysisResult, Flag } from "./detectors"
import { structuredAddressFromSchemaFields } from "@/lib/property-address/extract-from-analysis"
import { GEMINI_MODEL, generateContentWithRetry } from "@/lib/ai/gemini"
import { userFacingAnalysisFailureFromError } from "@/lib/ai/gemini-errors"
import { getTextFromGeminiResponse, parseJsonFromModelOutput } from "@/lib/ai/json-from-model"

const PROMPT_VERSION = "2.0"
const DEBUG_ANALYSIS_LOGS = process.env.DEBUG_ANALYSIS_LOGS === "1"

function debugLog(...args: unknown[]) {
  if (DEBUG_ANALYSIS_LOGS) console.debug(...args)
}

/**
 * Normalizes text by removing excessive whitespace and line breaks
 */
function normalizeText(text: string): string {
  // Replace multiple whitespace with single space
  let normalized = text.replace(/\s+/g, " ")
  // Remove excessive line breaks but keep some structure
  normalized = normalized.replace(/\n{3,}/g, "\n\n")
  // Trim
  normalized = normalized.trim()
  return normalized
}

/**
 * Analyzes EPC documents using the specialized EPC prompt
 * Returns structured EPC data transformed into the standard AnalysisResult format
 */
export async function analyzeEPCWithAI(
  text: string
): Promise<{ result: AnalysisResult; epcData: EPCResponse; modelName: string; promptVersion: string }> {
  const modelName = GEMINI_MODEL

  // Normalize text to handle formatting issues
  const normalizedText = normalizeText(text)
  debugLog("=== NORMALIZED TEXT FOR AI ===")
  debugLog("Normalized text length:", normalizedText.length)
  debugLog("First 1000 chars of normalized text:", normalizedText.substring(0, 1000))
  debugLog("=== END NORMALIZED TEXT ===")

  // Use up to 12000 chars for better context (increased from 8000)
  const textToSend = normalizedText.substring(0, 12000)
  const isTruncated = normalizedText.length > 12000

  try {
    debugLog("Sending text to AI (length:", textToSend.length, isTruncated ? ", truncated)" : ", full)")
    const prompt = `${EPC_PROMPT}\n\nExtract information from this EPC document:\n\n${textToSend}${
      isTruncated ? "\n\n[Document truncated for length]" : ""
    }`
    const response = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents: prompt,
    })
    const content = getTextFromGeminiResponse(response)
    if (!content) {
      throw new Error("No content in LLM response")
    }

    debugLog("=== RAW AI RESPONSE ===")
    debugLog(content)
    debugLog("=== END RAW AI RESPONSE ===")

    const parsed = parseJsonFromModelOutput(content)
    debugLog("=== PARSED JSON ===")
    debugLog(parsed !== null ? JSON.stringify(parsed, null, 2) : "(parse failed, using empty coercion)")
    debugLog("=== END PARSED JSON ===")

    const epcData = normalizeParsedEpcResponse(parsed)
    debugLog("=== COERCED EPC DATA ===")
    debugLog(JSON.stringify(epcData, null, 2))
    debugLog("=== END COERCED EPC DATA ===")

    // If the certificate is expired, immediately return a red status
    if (epcData.is_expired === true) {
      const property_address = propertyAddressFromEpc(epcData)
      const expiredResult: AnalysisResult = {
        status: "red",
        summary: "EPC certificate expired",
        flags: [
          {
            severity: "red",
            title: "Expired EPC certificate",
            details: `The EPC certificate expired on ${epcData.expiry_date}`,
          },
        ],
        confidence: 0.9,
        epc_score_letter: epcData.epc_score_letter,
        energy_consumption_kwh_m2_year: epcData.energy_consumption_kwh_m2_year,
        certificate_date: epcData.certificate_date,
        expiry_date: epcData.expiry_date,
        is_expired: epcData.is_expired,
        ...(property_address ? { property_address } : {}),
      }

      debugLog("=== FINAL ANALYSIS RESULT (EXPIRED) ===")
      debugLog(JSON.stringify(expiredResult, null, 2))
      debugLog("=== END FINAL ANALYSIS RESULT (EXPIRED) ===")

      return {
        result: expiredResult,
        epcData,
        modelName,
        promptVersion: PROMPT_VERSION,
      }
    }

    // Transform EPC data into standard AnalysisResult format
    debugLog("Transforming EPC data to analysis result...")
    const result = transformEPCToAnalysisResult(epcData)
    debugLog("=== FINAL ANALYSIS RESULT ===")
    debugLog(JSON.stringify(result, null, 2))
    debugLog("=== END FINAL ANALYSIS RESULT ===")

    return {
      result,
      epcData,
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  } catch (error) {
    console.error("EPC AI analysis failed:", error)
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

    const emptyEpcData: EPCResponse = {
      document_type: "epc",
      epc_score_letter: null,
      energy_consumption_kwh_m2_year: null,
      certificate_date: null,
      expiry_date: null,
      is_expired: null,
      red_flags: [],
      property_street: null,
      property_house_number: null,
      property_box: null,
      property_postal_code: null,
      property_municipality: null,
      property_region: null,
    }

    return {
      result: manualReviewResult,
      epcData: emptyEpcData,
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  }
}

function propertyAddressFromEpc(epcData: EPCResponse): AnalysisResult["property_address"] {
  const pa = structuredAddressFromSchemaFields({
    street: epcData.property_street,
    house_number: epcData.property_house_number,
    box: epcData.property_box,
    postal_code: epcData.property_postal_code,
    municipality: epcData.property_municipality,
    region: epcData.property_region,
  })
  return pa ?? undefined
}

/**
 * Transforms EPC-specific data into the standard AnalysisResult format
 */
function transformEPCToAnalysisResult(epcData: EPCResponse): AnalysisResult {
  const flags: Flag[] = []
  let status: "red" | "orange" | "green" = "green"
  const summaryParts: string[] = []

  // Build summary with extracted values
  if (epcData.epc_score_letter) {
    summaryParts.push(`EPC Score: ${epcData.epc_score_letter}`)
  }
  if (epcData.energy_consumption_kwh_m2_year !== null) {
    summaryParts.push(`Energy: ${epcData.energy_consumption_kwh_m2_year} kWh/m²/year`)
  }
  if (epcData.certificate_date) {
    summaryParts.push(`Certificate Date: ${epcData.certificate_date}`)
  }
  if (epcData.expiry_date) {
    summaryParts.push(`Expiry Date: ${epcData.expiry_date}`)
  }
  if (epcData.is_expired === true) {
    summaryParts.push("Status: EXPIRED")
  }

  // Process red flags from AI response
  const redFlags = epcData.red_flags || []
  
  if (redFlags.includes("expired_epc") || epcData.is_expired === true) {
    flags.push({
      severity: "red",
      title: "Expired EPC Certificate",
      details: `The EPC certificate expired on ${epcData.expiry_date || "unknown date"}. A new certificate is required.`,
    })
    status = "red"
  }

  if (redFlags.includes("invalid_epc_score") || !epcData.epc_score_letter) {
    flags.push({
      severity: "orange",
      title: "Invalid or Missing EPC Score",
      details: "The EPC score could not be determined from the document.",
    })
    if (status === "green") status = "orange"
  }

  if (redFlags.includes("missing_energy_value") || epcData.energy_consumption_kwh_m2_year === null) {
    flags.push({
      severity: "orange",
      title: "Missing Energy Consumption Value",
      details: "The energy consumption value could not be extracted from the document.",
    })
    if (status === "green") status = "orange"
  }

  if (redFlags.includes("missing_certificate_date") || !epcData.certificate_date) {
    flags.push({
      severity: "orange",
      title: "Missing Certificate Date",
      details: "The certificate date could not be extracted from the document.",
    })
    if (status === "green") status = "orange"
  }

  if (redFlags.includes("suspicious_energy_value") || (epcData.energy_consumption_kwh_m2_year !== null && epcData.energy_consumption_kwh_m2_year > 1000)) {
    flags.push({
      severity: "red",
      title: "Suspicious Energy Consumption Value",
      details: `The energy consumption value (${epcData.energy_consumption_kwh_m2_year} kWh/m²/year) is unusually high and may indicate an error.`,
    })
    status = "red"
  }

  // Determine status based on EPC score if no red flags
  if (flags.length === 0 && epcData.epc_score_letter) {
    if (epcData.epc_score_letter === "F") {
      status = "red"
      flags.push({
        severity: "red",
        title: "Poor Energy Performance (Class F)",
        details: "EPC class F indicates very poor energy performance. Immediate improvement recommended.",
      })
    } else if (epcData.epc_score_letter === "E" || epcData.epc_score_letter === "D") {
      status = "orange"
      flags.push({
        severity: "orange",
        title: `Moderate Energy Performance (Class ${epcData.epc_score_letter})`,
        details: `EPC class ${epcData.epc_score_letter} indicates moderate energy performance. Consider improvements.`,
      })
    }
  }

  const summary = summaryParts.length > 0 
    ? summaryParts.join(" | ")
    : "EPC document analyzed"

  const property_address = propertyAddressFromEpc(epcData)

  return {
    status,
    summary,
    flags,
    confidence: 0.9, // High confidence when using AI analysis
    // Include EPC-specific data in the result for UI display
    epc_score_letter: epcData.epc_score_letter,
    energy_consumption_kwh_m2_year: epcData.energy_consumption_kwh_m2_year,
    certificate_date: epcData.certificate_date,
    expiry_date: epcData.expiry_date,
    is_expired: epcData.is_expired,
    ...(property_address ? { property_address } : {}),
  } as AnalysisResult & {
    epc_score_letter?: string | null
    energy_consumption_kwh_m2_year?: number | null
    certificate_date?: string | null
    expiry_date?: string | null
    is_expired?: boolean | null
  }
}

