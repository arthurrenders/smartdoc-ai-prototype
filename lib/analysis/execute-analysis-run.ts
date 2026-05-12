import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import {
  extractTextFromPDF,
  extractTextFromPDFFallback,
} from "@/lib/pdf/extractor"
import { calculateConfidence } from "@/lib/analysis/detectors"
import { analyzeWithLLM } from "@/lib/analysis/llm-analyzer"
import { analyzeEPCWithAI } from "@/lib/analysis/epc-analyzer"
import { analyzeElectricalWithAI } from "@/lib/analysis/electrical-analyzer"
import { analyzeAsbestosWithAI } from "@/lib/analysis/asbestos-analyzer"
import type { AnalysisResult } from "@/lib/analysis/detectors"
import { extractDocumentDatesFromResult } from "@/lib/document-dates/extract-from-result"
import { replaceDocumentDatesForDocument } from "@/lib/document-dates/persist"
import { syncPropertyAddressFromDocumentAnalysis } from "@/lib/property-address/sync-from-analysis"
import { syncPropertyMetadataFromAnalysis } from "@/lib/property-metadata/sync-from-analysis"
import { BudgetExceededError } from "@/lib/ai/usage-budget"

export type DetectedDocumentKind =
  | "epc"
  | "electrical"
  | "asbestos"
  | "soil_certificate"
  | "urban_planning_info"
  | "unknown"

export function detectDocumentTypeFromPdfText(text: string): DetectedDocumentKind {
  const t = text.toLowerCase()

  if (
    t.includes("energieprestatiecertificaat") ||
    t.includes("energielabel") ||
    t.includes(" epc") ||
    t.includes("kwh/(m² jaar)") ||
    t.includes("kwh/(m2 jaar)") ||
    t.includes("kwh/m²") ||
    t.includes("kwh/m2")
  ) {
    return "epc"
  }

  if (
    t.includes("arei") ||
    t.includes("elektrische installatie") ||
    t.includes("elektrische keuring") ||
    t.includes("niet-conform") ||
    t.includes("niet conform")
  ) {
    return "electrical"
  }

  if (
    t.includes("asbestattest") ||
    t.includes("asbestveilig") ||
    t.includes("niet-asbestveilig") ||
    t.includes("attest_id") ||
    t.includes("niet asbestveilig")
  ) {
    return "asbestos"
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
    t.includes("vastgoedinformatie") ||
    t.includes("omgevingsvergunning") ||
    t.includes("stedenbouwkundige voorschriften")
  ) {
    return "urban_planning_info"
  }

  return "unknown"
}

/** User-facing label for what the PDF text suggests (keyword detector). */
function humanLabelForDetectedType(detected: Exclude<DetectedDocumentKind, "unknown">): string {
  switch (detected) {
    case "epc":
      return "an EPC (energy performance) certificate"
    case "electrical":
      return "an electrical inspection / AREI document"
    case "asbestos":
      return "an asbestos certificate"
    case "soil_certificate":
      return "a soil certificate / bodemattest"
    case "urban_planning_info":
      return "an urban-planning information document"
  }
}

/** Short name for the upload slot / expected type. */
function expectedSlotLabel(documentTypeName: string): string {
  switch (documentTypeName) {
    case "EPC":
      return "EPC"
    case "ELECTRICAL":
      return "electrical inspection"
    case "ASBESTOS":
      return "asbestos"
    default:
      return documentTypeName
  }
}

/** When keyword detection finds no EPC / electrical / asbestos cues in the PDF text. */
function notRecognizedAsExpectedDocumentMessage(
  expectedDbName: "EPC" | "ELECTRICAL" | "ASBESTOS"
): { summary: string; details: string } {
  const expected =
    expectedDbName === "EPC"
      ? "an EPC"
      : expectedDbName === "ELECTRICAL"
        ? "an electrical inspection"
        : "an asbestos"
  return {
    summary: `This document type was not recognized as ${expected} document.`,
    details: `The PDF text did not match the usual keywords for ${expectedSlotLabel(expectedDbName)}. Check that you uploaded the correct file, or try a text-based PDF export.`,
  }
}

function normalizeLooseText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function extractUrbanPlanningMetadata(text: string): Partial<AnalysisResult> {
  const normalized = normalizeLooseText(text)
  const out: Partial<AnalysisResult> = {}

  const areaMatch = normalized.match(
    /\b(?:bewoonbare oppervlakte|woonoppervlakte|bruto vloeroppervlakte|netto vloeroppervlakte|vloeroppervlakte)\D{0,40}(\d{2,5}(?:[,.]\d+)?)\s*(?:m2|m²|vierkante meter)\b/i
  )
  if (areaMatch) {
    const n = Number(areaMatch[1].replace(",", "."))
    if (Number.isFinite(n) && n > 0 && n < 100_000) {
      out.living_area_m2 = n
    }
  }

  if (/\b(appartement|flat|studio)\b/.test(normalized)) {
    out.dwelling_type = "apartment"
  } else if (/\b(eengezinswoning|woning|huis|rijwoning|halfopen bebouwing|open bebouwing)\b/.test(normalized)) {
    out.dwelling_type = "house"
  } else if (/\b(bouwgrond|perceel grond|grond)\b/.test(normalized)) {
    out.dwelling_type = "land"
  } else if (/\b(handelspand|kantoor|winkel|commercieel)\b/.test(normalized)) {
    out.dwelling_type = "commercial"
  }

  return out
}

export type ExecuteAnalysisRunResult =
  | { success: true; result: unknown }
  | { error: string; persistedToDb: true }
  | { error: string; persistedToDb: false }

/** No LLM call — keyword / heuristic paths only */
const ANALYSIS_MODEL_RULE_BASED = "rule-based"
/** LLM was attempted but threw before returning a provider label */
const ANALYSIS_MODEL_AI_FAILED = "ai_failed"

/**
 * Runs the full PDF download → extract → analyzer → persist pipeline for one `analysis_runs` row.
 * Centralized so intake, bulk upload, and the `runAnalysis` server action share identical behavior.
 */
export async function executeAnalysisRunPipeline(
  supabase: SupabaseClient,
  params: { analysisRunId: string; documentId: string; propertyId: string }
): Promise<ExecuteAnalysisRunResult> {
  const { analysisRunId, documentId, propertyId } = params

  const { error: processingError } = await supabase
    .from("analysis_runs")
    .update({ status: "processing" })
    .eq("id", analysisRunId)
    .eq("document_id", documentId)

  if (processingError) {
    return {
      error: `Failed to start processing: ${processingError.message}`,
      persistedToDb: false,
    }
  }

  async function markRunFailed(message: string) {
    try {
      await supabase
        .from("analysis_runs")
        .update({
          status: "error",
          result_json: { analysisError: message },
        })
        .eq("id", analysisRunId)
    } catch (e) {
      console.error("Failed to mark analysis_run as error:", e)
    }
    revalidatePath(`/properties/${propertyId}`)
  }

  try {
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("storage_path, document_type_id, property_id, document_types(name)")
      .eq("id", documentId)
      .single()

    if (documentError || !document) {
      throw new Error(`Failed to fetch document: ${documentError?.message ?? "Unknown error"}`)
    }

    const docPropertyId = document.property_id as string

    let documentTypeName: string | null = null
    if (document.document_types) {
      if (typeof document.document_types === "object" && "name" in document.document_types) {
        documentTypeName = (document.document_types as { name: string }).name
      } else if (Array.isArray(document.document_types) && document.document_types.length > 0) {
        documentTypeName = document.document_types[0].name
      }
    }

    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path as string)

    if (downloadError || !pdfBlob) {
      throw new Error(`Failed to download PDF: ${downloadError?.message ?? "Unknown error"}`)
    }

    const arrayBuffer = await pdfBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let extractedText: string

    try {
      try {
        const extractionInfo = await extractTextFromPDF(buffer)
        extractedText = extractionInfo.text
      } catch (pdfjsError) {
        console.warn("PDF extraction failed, trying fallback:", pdfjsError)
        const extractionInfo = await extractTextFromPDFFallback(buffer)
        extractedText = extractionInfo.text
      }
    } catch (parseError) {
      console.error("PDF extraction failed completely:", parseError)
      throw new Error(
        `Failed to parse PDF: ${parseError instanceof Error ? parseError.message : "Unknown error"}`
      )
    }

    let result
    let modelName: string | null = null
    let promptVersion: string | null = null

    const detectedType = detectDocumentTypeFromPdfText(extractedText)

    if (documentTypeName === "EPC") {
      if (detectedType === "unknown") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const { summary, details } = notRecognizedAsExpectedDocumentMessage("EPC")
        result = {
          status: "orange" as const,
          summary,
          flags: [
            {
              severity: "orange" as const,
              title: "Document type not recognized",
              details,
            },
          ],
        }
      } else if (detectedType !== "epc") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const detectedHuman = humanLabelForDetectedType(detectedType)
        result = {
          status: "orange" as const,
          summary: `Wrong document type: the PDF looks like ${detectedHuman}, but you uploaded it under ${expectedSlotLabel("EPC")}.`,
          flags: [
            {
              severity: "orange" as const,
              title: "Wrong document type",
              details: `Based on the text in this file, it matches ${detectedHuman}. This upload slot is for ${expectedSlotLabel("EPC")}. Please upload the correct PDF in the matching row.`,
            },
          ],
        }
      } else {
        try {
          const epcResult = await analyzeEPCWithAI(extractedText)
          result = epcResult.result
          modelName = epcResult.modelName
          promptVersion = epcResult.promptVersion
        } catch (epcError) {
          console.error("EPC AI analysis failed:", epcError)
          modelName = ANALYSIS_MODEL_AI_FAILED
          result = {
            status: "orange" as const,
            summary: "AI analysis failed. Manual review required.",
            flags: [
              {
                severity: "orange" as const,
                title: "Manual review required",
                details: "Automatic AI analysis failed and the document must be checked manually.",
              },
            ],
          }
        }
      }
    } else if (documentTypeName === "ELECTRICAL") {
      if (detectedType === "unknown") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const { summary, details } = notRecognizedAsExpectedDocumentMessage("ELECTRICAL")
        result = {
          status: "orange" as const,
          summary,
          flags: [
            {
              severity: "orange" as const,
              title: "Document type not recognized",
              details,
            },
          ],
        }
      } else if (detectedType !== "electrical") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const detectedHuman = humanLabelForDetectedType(detectedType)
        result = {
          status: "orange" as const,
          summary: `Wrong document type: the PDF looks like ${detectedHuman}, but you uploaded it under ${expectedSlotLabel("ELECTRICAL")}.`,
          flags: [
            {
              severity: "orange" as const,
              title: "Wrong document type",
              details: `Based on the text in this file, it matches ${detectedHuman}. This upload slot is for ${expectedSlotLabel("ELECTRICAL")}. Please upload the correct PDF in the matching row.`,
            },
          ],
        }
      } else {
        try {
          const electricalResult = await analyzeElectricalWithAI(extractedText)
          result = electricalResult.result
          modelName = electricalResult.modelName
          promptVersion = electricalResult.promptVersion
        } catch (electricalError) {
          console.error("Electrical AI analysis failed at pipeline level:", electricalError)
          modelName = ANALYSIS_MODEL_AI_FAILED
          result = {
            status: "orange" as const,
            summary: "AI analysis failed. Manual review required.",
            flags: [
              {
                severity: "orange" as const,
                title: "Manual review required",
                details: "Automatic AI analysis failed and the document must be checked manually.",
              },
            ],
          }
        }
      }
    } else if (documentTypeName === "ASBESTOS") {
      if (detectedType === "unknown") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const { summary, details } = notRecognizedAsExpectedDocumentMessage("ASBESTOS")
        result = {
          status: "orange" as const,
          summary,
          flags: [
            {
              severity: "orange" as const,
              title: "Document type not recognized",
              details,
            },
          ],
        }
      } else if (detectedType !== "asbestos") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const detectedHuman = humanLabelForDetectedType(detectedType)
        result = {
          status: "orange" as const,
          summary: `Wrong document type: the PDF looks like ${detectedHuman}, but you uploaded it under ${expectedSlotLabel("ASBESTOS")}.`,
          flags: [
            {
              severity: "orange" as const,
              title: "Wrong document type",
              details: `Based on the text in this file, it matches ${detectedHuman}. This upload slot is for ${expectedSlotLabel("ASBESTOS")}. Please upload the correct PDF in the matching row.`,
            },
          ],
        }
      } else {
        try {
          const asbestosResult = await analyzeAsbestosWithAI(extractedText)
          result = asbestosResult.result
          modelName = asbestosResult.modelName
          promptVersion = asbestosResult.promptVersion
        } catch (asbestosError) {
          console.error("Asbestos AI analysis failed at pipeline level:", asbestosError)
          modelName = ANALYSIS_MODEL_AI_FAILED
          result = {
            status: "orange" as const,
            summary: "AI analysis failed. Manual review required.",
            flags: [
              {
                severity: "orange" as const,
                title: "Manual review required",
                details: "Automatic AI analysis failed and the document must be checked manually.",
              },
            ],
          }
        }
      }
    } else if (
      documentTypeName === "SOIL_CERTIFICATE" ||
      documentTypeName === "URBAN_PLANNING_INFO"
    ) {
      // Upload-only types: no AI analyzer exists for these. Persist a benign
      // Dutch result so the UI shows "groen — opgeladen", and set confidence
      // high enough to skip the LLM fallback below (saves Gemini tokens).
      modelName = ANALYSIS_MODEL_RULE_BASED
      const metadata =
        documentTypeName === "URBAN_PLANNING_INFO"
          ? extractUrbanPlanningMetadata(extractedText)
          : {}
      result = {
        status: "green" as const,
        summary: "Document opgeladen — geen automatische analyse beschikbaar.",
        flags: [],
        confidence: 1,
        ...metadata,
      }
    } else {
      modelName = ANALYSIS_MODEL_RULE_BASED
      result = {
        status: "green" as const,
        summary: "Document reviewed - unknown type",
        flags: [],
      }
    }

    if (documentTypeName !== "EPC" && documentTypeName) {
      const confidence = result.confidence || calculateConfidence(result, extractedText)
      result.confidence = confidence

      const shouldUseLLM = confidence < 0.5 || result.summary.trim().length === 0

      if (shouldUseLLM) {
        try {
          const llmResult = await analyzeWithLLM(extractedText, documentTypeName)
          result = {
            status: llmResult.result.status,
            summary: llmResult.result.summary,
            flags: llmResult.result.flags,
            confidence: llmResult.result.confidence || confidence,
          }
          modelName = llmResult.modelName
          promptVersion = llmResult.promptVersion
        } catch (llmError) {
          console.error("LLM analysis failed:", llmError)
          if (!modelName) modelName = ANALYSIS_MODEL_AI_FAILED
        }
      }
    }

    const { error: updateError } = await supabase
      .from("analysis_runs")
      .update({
        status: "done",
        result_json: result,
        model_name: modelName,
        prompt_version: promptVersion,
      })
      .eq("id", analysisRunId)

    if (updateError) {
      throw new Error(`Failed to update analysis: ${updateError.message}`)
    }

    console.info(
      `[analysis] AI model used: ${modelName ?? ANALYSIS_MODEL_RULE_BASED} (documentId=${documentId}, analysisRunId=${analysisRunId})`
    )

    const { error: clearFlagsError } = await supabase
      .from("red_flags")
      .delete()
      .eq("document_id", documentId)
    if (clearFlagsError) {
      console.error("Failed to clear old red flags:", clearFlagsError)
    }

    if (
      (result.status === "orange" || result.status === "red") &&
      Array.isArray(result.flags) &&
      result.flags.length > 0
    ) {
      const flagsToInsert = result.flags.map((flag: { severity: string; title: string; details: string }) => ({
        document_id: documentId,
        severity: flag.severity,
        title: flag.title,
        details: flag.details,
      }))

      const { error: flagsError } = await supabase.from("red_flags").insert(flagsToInsert)

      if (flagsError) {
        console.error("Failed to insert red flags:", flagsError)
      }
    }

    try {
      const dates = extractDocumentDatesFromResult(documentTypeName, result)
      await replaceDocumentDatesForDocument(supabase, {
        propertyId: docPropertyId,
        documentId,
        analysisRunId,
        dates,
      })
    } catch (dateErr) {
      console.error("Failed to persist document_dates:", dateErr)
    }

    try {
      await syncPropertyAddressFromDocumentAnalysis(supabase, {
        propertyId: docPropertyId,
        result: result as AnalysisResult,
        extractedText,
      })
    } catch (addrErr) {
      console.error("Failed to sync property address from analysis:", addrErr)
    }

    try {
      await syncPropertyMetadataFromAnalysis(supabase, {
        propertyId: docPropertyId,
        documentTypeName,
        result: result as AnalysisResult,
      })
    } catch (metaErr) {
      console.error("Failed to sync property metadata from analysis:", metaErr)
    }

    revalidatePath(`/properties/${propertyId}`)
    revalidatePath("/")

    return { success: true, result }
  } catch (pipelineError) {
    const msg =
      pipelineError instanceof BudgetExceededError
        ? pipelineError.userMessage
        : pipelineError instanceof Error
          ? pipelineError.message
          : "Unknown error occurred"
    await markRunFailed(msg)
    return { error: msg, persistedToDb: true }
  }
}
