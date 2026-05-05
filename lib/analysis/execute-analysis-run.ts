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

export function detectDocumentTypeFromPdfText(text: string): "epc" | "electrical" | "asbestos" | "unknown" {
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
    t.includes("niet asbestveilig")
  ) {
    return "asbestos"
  }

  return "unknown"
}

export type ExecuteAnalysisRunResult =
  | { success: true; result: unknown }
  | { error: string; persistedToDb: true }
  | { error: string; persistedToDb: false }

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
      if (detectedType && detectedType !== "epc") {
        result = {
          status: "orange" as const,
          summary: "Wrong document type uploaded.",
          flags: [
            {
              severity: "orange" as const,
              title: "Wrong document type",
              details:
                "This file does not appear to be an EPC certificate based on its contents. Please upload the correct document type.",
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
      if (detectedType && detectedType !== "electrical") {
        const detectedLabel =
          detectedType === "epc"
            ? "EPC document"
            : detectedType === "asbestos"
              ? "asbestos certificate"
              : "different document type"
        result = {
          status: "orange" as const,
          summary: "Wrong document type uploaded.",
          flags: [
            {
              severity: "orange" as const,
              title: "Wrong document type",
              details: `This file appears to be an ${detectedLabel}, not an electrical inspection document.`,
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
      if (detectedType && detectedType !== "asbestos") {
        const detectedLabel =
          detectedType === "epc"
            ? "EPC document"
            : detectedType === "electrical"
              ? "electrical inspection document"
              : "different document type"
        result = {
          status: "orange" as const,
          summary: "Wrong document type uploaded.",
          flags: [
            {
              severity: "orange" as const,
              title: "Wrong document type",
              details: `This file appears to be an ${detectedLabel}, not an asbestos certificate.`,
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
    } else {
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

    revalidatePath(`/properties/${propertyId}`)
    revalidatePath("/")

    return { success: true, result }
  } catch (pipelineError) {
    const msg = pipelineError instanceof Error ? pipelineError.message : "Unknown error occurred"
    await markRunFailed(msg)
    return { error: msg, persistedToDb: true }
  }
}
