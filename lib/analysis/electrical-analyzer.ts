import "server-only"
import type { AnalysisResult, Flag } from "./detectors"
import { ELECTRICAL_PROMPT } from "@/lib/ai/prompts/electrical"
import { geminiClient, GEMINI_MODEL } from "@/lib/ai/gemini"

const PROMPT_VERSION = "1.0"

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
}

function normalizeText(text: string): string {
  let normalized = text.replace(/\s+/g, " ")
  normalized = normalized.replace(/\n{3,}/g, "\n\n")
  normalized = normalized.trim()
  return normalized
}

export async function analyzeElectricalWithAI(
  text: string
): Promise<{ result: AnalysisResult; modelName: string; promptVersion: string }> {
  const modelName = GEMINI_MODEL

  const normalizedText = normalizeText(text)
  console.log("=== ELECTRICAL NORMALIZED TEXT FOR AI ===")
  console.log("Normalized text length:", normalizedText.length)
  console.log("First 1000 chars of normalized text:", normalizedText.substring(0, 1000))
  console.log("=== END ELECTRICAL NORMALIZED TEXT ===")

  const textToSend = normalizedText.substring(0, 12000)
  const isTruncated = normalizedText.length > 12000

  try {
    console.log("Sending electrical text to AI (length:", textToSend.length, isTruncated ? ", truncated)" : ", full)")
    const prompt = `${ELECTRICAL_PROMPT}\n\nExtract information from this electrical inspection document:\n\n${textToSend}${
      isTruncated ? "\n\n[Document truncated for length]" : ""
    }`
    const response = await geminiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    })
    const content = response.text
    if (!content) {
      throw new Error("No content in electrical LLM response")
    }

    console.log("=== RAW ELECTRICAL AI RESPONSE ===")
    console.log(content)
    console.log("=== END RAW ELECTRICAL AI RESPONSE ===")

    const cleanedContent = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim()

    console.log("=== CLEANED ELECTRICAL AI RESPONSE ===")
    console.log(cleanedContent)
    console.log("=== END CLEANED ELECTRICAL AI RESPONSE ===")

    let parsed: unknown
    try {
      parsed = JSON.parse(cleanedContent)
      console.log("=== PARSED ELECTRICAL JSON ===")
      console.log(JSON.stringify(parsed, null, 2))
      console.log("=== END PARSED ELECTRICAL JSON ===")
    } catch (parseError) {
      console.error("Failed to parse electrical AI JSON response:", parseError)
      console.error("Raw content that failed to parse:", content)
      console.error("Cleaned content that failed to parse:", cleanedContent)
      throw new Error(
        `Failed to parse electrical AI JSON response: ${
          parseError instanceof Error ? parseError.message : "Unknown error"
        }`
      )
    }

    const electricalData = parsed as ElectricalAIResponse

    console.log("Transforming electrical AI data to analysis result...")
    const result = transformElectricalToAnalysisResult(electricalData)
    console.log("=== FINAL ELECTRICAL ANALYSIS RESULT ===")
    console.log(JSON.stringify(result, null, 2))
    console.log("=== END FINAL ELECTRICAL ANALYSIS RESULT ===")

    return {
      result,
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  } catch (error) {
    console.error("Electrical AI analysis failed:", error)

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

function transformElectricalToAnalysisResult(data: ElectricalAIResponse): AnalysisResult {
  const flags: Flag[] = []
  let status: "red" | "orange" | "green" = "green"
  const summaryParts: string[] = []

  // If the AI explicitly reports a wrong document type, surface that directly
  if (data.wrong_document_type && data.red_flags && data.red_flags.includes("wrong_document_type")) {
    return {
      status: "orange",
      summary: "Wrong document type uploaded.",
      flags: [
        {
          severity: "orange",
          title: "Wrong document type",
          details:
            "This file appears to be a different document type (for example an EPC certificate), not an electrical inspection document.",
        },
      ],
    }
  }

  if (data.inspection_result) {
    summaryParts.push(`Inspection result: ${data.inspection_result}`)
  }
  if (data.certificate_number) {
    summaryParts.push(`Certificate: ${data.certificate_number}`)
  }
  if (data.inspection_date) {
    summaryParts.push(`Inspection date: ${data.inspection_date}`)
  }
  if (data.expiry_date) {
    summaryParts.push(`Expiry date: ${data.expiry_date}`)
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
      title: "Non-compliant electrical installation",
      details:
        "The inspection concludes that the electrical installation is not compliant with Belgian AREI regulations.",
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
      summary: "AI analysis failed. Manual review required.",
      flags: [
        {
          severity: "orange",
          title: "Manual review required",
          details:
            "The AI could not extract key electrical inspection information from this document. Please verify the document type and contents manually.",
        },
      ],
    }
  }

  const summary =
    summaryParts.length > 0 ? summaryParts.join(" | ") : "Electrical inspection document analyzed"

  const result: AnalysisResult = {
    status,
    summary,
    flags,
    confidence: 0.9,
  }

  return result
}

