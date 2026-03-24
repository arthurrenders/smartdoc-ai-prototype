import "server-only"
import type { AnalysisResult, Flag } from "./detectors"
import { structuredAddressFromSchemaFields } from "@/lib/property-address/extract-from-analysis"
import { ASBEST_PROMPT as ASBESTOS_PROMPT } from "@/lib/ai/prompts/asbestos"
import { geminiClient, GEMINI_MODEL } from "@/lib/ai/gemini"

const PROMPT_VERSION = "1.0"

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

export async function analyzeAsbestosWithAI(
  text: string
): Promise<{ result: AnalysisResult; modelName: string; promptVersion: string }> {
  const modelName = GEMINI_MODEL

  const normalizedText = normalizeText(text)
  console.log("=== ASBESTOS NORMALIZED TEXT FOR AI ===")
  console.log("Normalized text length:", normalizedText.length)
  console.log("First 1000 chars of normalized text:", normalizedText.substring(0, 1000))
  console.log("=== END ASBESTOS NORMALIZED TEXT ===")

  const textToSend = normalizedText.substring(0, 12000)
  const isTruncated = normalizedText.length > 12000

  try {
    console.log("Sending asbestos text to AI (length:", textToSend.length, isTruncated ? ", truncated)" : ", full)")
    const prompt = `${ASBESTOS_PROMPT}\n\nExtract information from this asbestos certificate:\n\n${textToSend}${
      isTruncated ? "\n\n[Document truncated for length]" : ""
    }`
    const response = await geminiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    })
    const content = response.text
    if (!content) {
      throw new Error("No content in asbestos LLM response")
    }

    console.log("=== RAW ASBESTOS AI RESPONSE ===")
    console.log(content)
    console.log("=== END RAW ASBESTOS AI RESPONSE ===")

    const cleanedContent = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim()

    console.log("=== CLEANED ASBESTOS AI RESPONSE ===")
    console.log(cleanedContent)
    console.log("=== END CLEANED ASBESTOS AI RESPONSE ===")

    let parsed: unknown
    try {
      parsed = JSON.parse(cleanedContent)
      console.log("=== PARSED ASBESTOS JSON ===")
      console.log(JSON.stringify(parsed, null, 2))
      console.log("=== END PARSED ASBESTOS JSON ===")
    } catch (parseError) {
      console.error("Failed to parse asbestos AI JSON response:", parseError)
      console.error("Raw content that failed to parse:", content)
      console.error("Cleaned content that failed to parse:", cleanedContent)
      throw new Error(
        `Failed to parse asbestos AI JSON response: ${
          parseError instanceof Error ? parseError.message : "Unknown error"
        }`
      )
    }

    const asbestosData = parsed as AsbestosAIResponse

    console.log("Transforming asbestos AI data to analysis result...")
    const result = transformAsbestosToAnalysisResult(asbestosData)
    console.log("=== FINAL ASBESTOS ANALYSIS RESULT ===")
    console.log(JSON.stringify(result, null, 2))
    console.log("=== END FINAL ASBESTOS ANALYSIS RESULT ===")

    return {
      result,
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  } catch (error) {
    console.error("Asbestos AI analysis failed:", error)

    const manualReviewResult: AnalysisResult = {
      status: "orange",
      summary: "AI analysis failed. Manual review required.",
      flags: [
        {
          severity: "orange",
          title: "Manual review required",
          details: "Automatic AI analysis failed and the document must be checked manually.",
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
      summary: "AI analysis failed. Manual review required.",
      flags: [
        {
          severity: "orange",
          title: "Manual review required",
          details:
            "The AI could not extract key asbestos certificate information from this document. Please verify the document type and contents manually.",
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

