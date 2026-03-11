import "server-only"
import OpenAI from "openai"
import { z } from "zod"
import { EPCResponseSchema, type EPCResponse } from "./epc-schema"
import { EPC_PROMPT } from "@/lib/ai/prompts/epc"
import type { AnalysisResult, Flag } from "./detectors"

const PROMPT_VERSION = "2.0"

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
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }

  const openai = new OpenAI({ apiKey })
  const modelName = "gpt-4o-mini"

  // Normalize text to handle formatting issues
  const normalizedText = normalizeText(text)
  console.log("=== NORMALIZED TEXT FOR AI ===")
  console.log("Normalized text length:", normalizedText.length)
  console.log("First 1000 chars of normalized text:", normalizedText.substring(0, 1000))
  console.log("=== END NORMALIZED TEXT ===")

  // Use up to 12000 chars for better context (increased from 8000)
  const textToSend = normalizedText.substring(0, 12000)
  const isTruncated = normalizedText.length > 12000

  try {
    console.log("Sending text to AI (length:", textToSend.length, isTruncated ? ", truncated)" : ", full)")
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: EPC_PROMPT,
        },
        {
          role: "user",
          content: `Extract information from this EPC document:\n\n${textToSend}${isTruncated ? "\n\n[Document truncated for length]" : ""}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("No content in LLM response")
    }

    console.log("=== RAW AI RESPONSE ===")
    console.log(content)
    console.log("=== END RAW AI RESPONSE ===")

    // Parse JSON safely
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
      console.log("=== PARSED JSON ===")
      console.log(JSON.stringify(parsed, null, 2))
      console.log("=== END PARSED JSON ===")
    } catch (parseError) {
      console.error("Failed to parse EPC AI JSON response:", parseError)
      console.error("Raw content that failed to parse:", content)
      throw new Error(`Failed to parse EPC AI JSON response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`)
    }

    // Validate with Zod
    let epcData: EPCResponse
    try {
      epcData = EPCResponseSchema.parse(parsed)
      console.log("=== VALIDATED EPC DATA ===")
      console.log(JSON.stringify(epcData, null, 2))
      console.log("=== END VALIDATED EPC DATA ===")
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        console.error("EPC AI response validation failed:", validationError.errors)
        console.error("Parsed data that failed validation:", parsed)
        throw new Error(`EPC AI output validation failed: ${validationError.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`)
      }
      throw validationError
    }

    // Transform EPC data into standard AnalysisResult format
    console.log("Transforming EPC data to analysis result...")
    const result = transformEPCToAnalysisResult(epcData)
    console.log("=== FINAL ANALYSIS RESULT ===")
    console.log(JSON.stringify(result, null, 2))
    console.log("=== END FINAL ANALYSIS RESULT ===")

    return {
      result,
      epcData,
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  } catch (error) {
    console.error("EPC AI analysis failed:", error)
    throw error
  }
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
  } as AnalysisResult & {
    epc_score_letter?: string | null
    energy_consumption_kwh_m2_year?: number | null
    certificate_date?: string | null
    expiry_date?: string | null
    is_expired?: boolean | null
  }
}

