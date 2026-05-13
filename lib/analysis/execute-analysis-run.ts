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
import { analyzeSoilCertificateWithAI } from "@/lib/analysis/soil-certificate-analyzer"
import { analyzeUrbanPlanningWithAI } from "@/lib/analysis/urban-planning-analyzer"
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

  // Broader cue-based fallback: electrical inspection reports frequently use these phrases
  // without the strict "elektrische installatie" wording (e.g. "DE INSTALATIE IS CONFORM"
  // with the typo, or just "Verslagnummer … Adres installatie …").
  const electricalCues = [
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
    "elektrisch keuringsverslag",
  ]
  const cueHits = electricalCues.reduce((n, cue) => (t.includes(cue) ? n + 1 : n), 0)
  if (cueHits >= 2 || (cueHits >= 1 && (t.includes("conform") || t.includes("keuring")))) {
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
    t.includes("grondinformatieregister") ||
    t.includes("grondeninformatieregister")
  ) {
    return "soil_certificate"
  }

  if (
    t.includes("stedenbouwkundige inlichtingen") ||
    t.includes("stedenbouwkundig uittreksel") ||
    t.includes("stedenbouwkundig attest") ||
    t.includes("vastgoedinformatie") ||
    t.includes("omgevingsinformatie") ||
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
      return "een EPC-attest"
    case "electrical":
      return "een elektrische keuring / AREI-document"
    case "asbestos":
      return "een asbestattest"
    case "soil_certificate":
      return "een bodemattest"
    case "urban_planning_info":
      return "stedenbouwkundige inlichtingen"
  }
}

/** Short name for the upload slot / expected type. */
function expectedSlotLabel(documentTypeName: string): string {
  switch (documentTypeName) {
    case "EPC":
      return "EPC"
    case "ELECTRICAL":
      return "elektrische keuring"
    case "ASBESTOS":
      return "asbestattest"
    case "SOIL_CERTIFICATE":
      return "bodemattest"
    case "URBAN_PLANNING_INFO":
      return "stedenbouwkundige inlichtingen"
    default:
      return documentTypeName
  }
}

/** When keyword detection finds no EPC / electrical / asbestos cues in the PDF text. */
function notRecognizedAsExpectedDocumentMessage(
  expectedDbName: "EPC" | "ELECTRICAL" | "ASBESTOS" | "SOIL_CERTIFICATE" | "URBAN_PLANNING_INFO"
): { summary: string; details: string } {
  const expected =
    expectedDbName === "EPC"
      ? "een EPC"
      : expectedDbName === "ELECTRICAL"
        ? "een elektrische keuring"
        : expectedDbName === "ASBESTOS"
          ? "een asbestattest"
          : expectedDbName === "SOIL_CERTIFICATE"
            ? "een bodemattest"
            : "stedenbouwkundige inlichtingen"
  return {
    summary: `Dit documenttype werd niet herkend als ${expected}.`,
    details: `De PDF-tekst bevat niet de gebruikelijke sleutelwoorden voor ${expectedSlotLabel(expectedDbName)}. Controleer of het juiste bestand is opgeladen of probeer een tekstgebaseerde PDF-export.`,
  }
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
    revalidatePath("/map")
    revalidatePath("/")
    revalidatePath("/analytics")
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
              title: "Documenttype niet herkend",
              details,
            },
          ],
        }
      } else if (detectedType !== "epc") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const detectedHuman = humanLabelForDetectedType(detectedType)
        result = {
          status: "orange" as const,
          summary: `Verkeerd documenttype: de PDF lijkt op ${detectedHuman}, maar werd opgeladen onder ${expectedSlotLabel("EPC")}.`,
          flags: [
            {
              severity: "orange" as const,
              title: "Verkeerd documenttype",
              details: `Op basis van de tekst lijkt dit bestand op ${detectedHuman}. Deze rij is bedoeld voor ${expectedSlotLabel("EPC")}. Laad de juiste PDF op in de passende rij.`,
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
            summary: "AI-analyse mislukt. Handmatige controle nodig.",
            flags: [
              {
                severity: "orange" as const,
                title: "Handmatige controle nodig",
                details: "De automatische AI-analyse is mislukt. Controleer het document handmatig.",
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
              title: "Documenttype niet herkend",
              details,
            },
          ],
        }
      } else if (detectedType !== "electrical") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const detectedHuman = humanLabelForDetectedType(detectedType)
        result = {
          status: "orange" as const,
          summary: `Verkeerd documenttype: de PDF lijkt op ${detectedHuman}, maar werd opgeladen onder ${expectedSlotLabel("ELECTRICAL")}.`,
          flags: [
            {
              severity: "orange" as const,
              title: "Verkeerd documenttype",
              details: `Op basis van de tekst lijkt dit bestand op ${detectedHuman}. Deze rij is bedoeld voor ${expectedSlotLabel("ELECTRICAL")}. Laad de juiste PDF op in de passende rij.`,
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
            summary: "AI-analyse mislukt. Handmatige controle nodig.",
            flags: [
              {
                severity: "orange" as const,
                title: "Handmatige controle nodig",
                details: "De automatische AI-analyse is mislukt. Controleer het document handmatig.",
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
              title: "Documenttype niet herkend",
              details,
            },
          ],
        }
      } else if (detectedType !== "asbestos") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const detectedHuman = humanLabelForDetectedType(detectedType)
        result = {
          status: "orange" as const,
          summary: `Verkeerd documenttype: de PDF lijkt op ${detectedHuman}, maar werd opgeladen onder ${expectedSlotLabel("ASBESTOS")}.`,
          flags: [
            {
              severity: "orange" as const,
              title: "Verkeerd documenttype",
              details: `Op basis van de tekst lijkt dit bestand op ${detectedHuman}. Deze rij is bedoeld voor ${expectedSlotLabel("ASBESTOS")}. Laad de juiste PDF op in de passende rij.`,
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
            summary: "AI-analyse mislukt. Handmatige controle nodig.",
            flags: [
              {
                severity: "orange" as const,
                title: "Handmatige controle nodig",
                details: "De automatische AI-analyse is mislukt. Controleer het document handmatig.",
              },
            ],
          }
        }
      }
    } else if (documentTypeName === "SOIL_CERTIFICATE") {
      if (detectedType === "unknown") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const { summary, details } = notRecognizedAsExpectedDocumentMessage("SOIL_CERTIFICATE")
        result = {
          status: "orange" as const,
          summary,
          flags: [{ severity: "orange" as const, title: "Documenttype niet herkend", details }],
        }
      } else if (detectedType !== "soil_certificate") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const detectedHuman = humanLabelForDetectedType(detectedType)
        result = {
          status: "orange" as const,
          summary: `Verkeerd documenttype: de PDF lijkt op ${detectedHuman}, maar werd opgeladen onder ${expectedSlotLabel("SOIL_CERTIFICATE")}.`,
          flags: [
            {
              severity: "orange" as const,
              title: "Verkeerd documenttype",
              details: `Op basis van de tekst lijkt dit bestand op ${detectedHuman}. Deze rij is bedoeld voor ${expectedSlotLabel("SOIL_CERTIFICATE")}. Laad de juiste PDF op in de passende rij.`,
            },
          ],
        }
      } else {
        const soilResult = await analyzeSoilCertificateWithAI(extractedText)
        result = soilResult.result
        modelName = soilResult.modelName
        promptVersion = soilResult.promptVersion
      }
    } else if (documentTypeName === "URBAN_PLANNING_INFO") {
      if (detectedType === "unknown") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const { summary, details } = notRecognizedAsExpectedDocumentMessage("URBAN_PLANNING_INFO")
        result = {
          status: "orange" as const,
          summary,
          flags: [{ severity: "orange" as const, title: "Documenttype niet herkend", details }],
        }
      } else if (detectedType !== "urban_planning_info") {
        modelName = ANALYSIS_MODEL_RULE_BASED
        const detectedHuman = humanLabelForDetectedType(detectedType)
        result = {
          status: "orange" as const,
          summary: `Verkeerd documenttype: de PDF lijkt op ${detectedHuman}, maar werd opgeladen onder ${expectedSlotLabel("URBAN_PLANNING_INFO")}.`,
          flags: [
            {
              severity: "orange" as const,
              title: "Verkeerd documenttype",
              details: `Op basis van de tekst lijkt dit bestand op ${detectedHuman}. Deze rij is bedoeld voor ${expectedSlotLabel("URBAN_PLANNING_INFO")}. Laad de juiste PDF op in de passende rij.`,
            },
          ],
        }
      } else {
        const urbanResult = await analyzeUrbanPlanningWithAI(extractedText)
        result = urbanResult.result
        modelName = urbanResult.modelName
        promptVersion = urbanResult.promptVersion
      }
    } else {
      modelName = ANALYSIS_MODEL_RULE_BASED
      result = {
        status: "green" as const,
        summary: "Document nagekeken - onbekend type",
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
    revalidatePath("/map")
    revalidatePath("/")
    revalidatePath("/analytics")

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
