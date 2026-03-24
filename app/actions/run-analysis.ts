"use server"

import { createServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
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

function detectDocumentType(text: string): "epc" | "electrical" | "asbestos" | "unknown" {
  const t = text.toLowerCase()

  // EPC indicators
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

  // Electrical indicators
  if (
    t.includes("arei") ||
    t.includes("elektrische installatie") ||
    t.includes("elektrische keuring") ||
    t.includes("elektrische keuring") ||
    t.includes("elektrische installatie") ||
    t.includes("niet-conform") ||
    t.includes("niet conform")
  ) {
    return "electrical"
  }

  // Asbestos indicators
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

const runAnalysisSchema = z.object({
  analysisRunId: z.string().uuid(),
  documentId: z.string().uuid(),
  propertyId: z.string().uuid(),
})

export async function runAnalysis(formData: FormData) {
  try {
    const analysisRunIdRaw = formData.get("analysisRunId") as string
    const documentIdRaw = formData.get("documentId") as string
    const propertyIdRaw = formData.get("propertyId") as string

    const validation = runAnalysisSchema.safeParse({
      analysisRunId: analysisRunIdRaw,
      documentId: documentIdRaw,
      propertyId: propertyIdRaw,
    })

    if (!validation.success) {
      return { error: "Invalid input data", persistedToDb: false as const }
    }

    const { analysisRunId, documentId, propertyId } = validation.data
    const supabase = createServerClient()

    // Set status to 'processing'
    const { error: processingError } = await supabase
      .from("analysis_runs")
      .update({ status: "processing" })
      .eq("id", analysisRunId)

    if (processingError) {
      return {
        error: `Failed to start processing: ${processingError.message}`,
        persistedToDb: false as const,
      }
    }

    async function markRunFailed(message: string) {
      try {
        await supabase.from("analysis_runs").update({
          status: "error",
          result_json: { analysisError: message },
        }).eq("id", analysisRunId)
      } catch (e) {
        console.error("Failed to mark analysis_run as error:", e)
      }
      revalidatePath(`/properties/${propertyId}`)
    }

    try {
    // Fetch document to get storage_path and document_type_id
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("storage_path, document_type_id, property_id, document_types(name)")
      .eq("id", documentId)
      .single()

    if (documentError || !document) {
      throw new Error(`Failed to fetch document: ${documentError?.message ?? "Unknown error"}`)
    }

    const docPropertyId = document.property_id as string

    // Extract document type name from the query result
    let documentTypeName: string | null = null
    if (document.document_types) {
      if (typeof document.document_types === "object" && "name" in document.document_types) {
        documentTypeName = (document.document_types as { name: string }).name
      } else if (Array.isArray(document.document_types) && document.document_types.length > 0) {
        documentTypeName = document.document_types[0].name
      }
    }

    // Download PDF from Supabase Storage
    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path)

    if (downloadError || !pdfBlob) {
      throw new Error(`Failed to download PDF: ${downloadError?.message ?? "Unknown error"}`)
    }

    // Convert Blob to Buffer for PDF parsing
    const arrayBuffer = await pdfBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text from PDF with improved extraction
    let extractedText: string
    let extractionInfo: {
      text: string
      pages: Array<{ pageNumber: number; text: string; length: number }>
      totalLength: number
    }

    try {
      console.log("=== PDF EXTRACTION START ===")
      console.log("PDF buffer size:", buffer.length, "bytes")

      try {
        extractionInfo = await extractTextFromPDF(buffer)
        extractedText = extractionInfo.text
        console.log("Successfully extracted PDF text")
      } catch (pdfjsError) {
        console.warn("PDF extraction failed, trying fallback:", pdfjsError)
        extractionInfo = await extractTextFromPDFFallback(buffer)
        extractedText = extractionInfo.text
        console.log("Using fallback extraction (pdf-parse)")
      }

      console.log("=== PDF EXTRACTION RESULTS ===")
      console.log("Total pages:", extractionInfo.pages.length)
      extractionInfo.pages.forEach((page) => {
        console.log(`Page ${page.pageNumber}: ${page.length} characters`)
        if (page.length > 0) {
          console.log(`  Preview: ${page.text.substring(0, 200)}...`)
        } else {
          console.log(`  WARNING: Page ${page.pageNumber} has no text!`)
        }
      })
      console.log("Total extracted text length:", extractedText.length)
      console.log("Full extracted text:")
      console.log(extractedText)
      console.log("=== END PDF EXTRACTION ===")

      if (extractedText.length < 10) {
        console.error("WARNING: Very little text extracted from PDF!")
        console.error("This may indicate a scanning/image-based PDF that requires OCR")
      }
    } catch (parseError) {
      console.error("PDF extraction failed completely:", parseError)
      throw new Error(
        `Failed to parse PDF: ${parseError instanceof Error ? parseError.message : "Unknown error"}`
      )
    }

    // Run analysis based on document type
    let result
    let modelName: string | null = null
    let promptVersion: string | null = null

    const detectedType = detectDocumentType(extractedText)

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
        // Use specialized EPC AI analyzer
        try {
          console.log("=== EPC ANALYSIS START ===")
          console.log("Full extracted PDF text for EPC analysis:")
          console.log(extractedText)
          console.log("=== END PDF TEXT ===")
          console.log("Running EPC AI analysis")
          const epcResult = await analyzeEPCWithAI(extractedText)
          result = epcResult.result
          modelName = epcResult.modelName
          promptVersion = epcResult.promptVersion
          console.log("EPC AI analysis result:", JSON.stringify(result, null, 2))
        } catch (epcError) {
          console.error("EPC AI analysis failed:", epcError)
          // Fallback to manual review if AI fails at this level
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
        // Use specialized Electrical AI analyzer
        try {
          console.log("=== ELECTRICAL ANALYSIS START ===")
          console.log("Running Electrical AI analysis")
          const electricalResult = await analyzeElectricalWithAI(extractedText)
          result = electricalResult.result
          modelName = electricalResult.modelName
          promptVersion = electricalResult.promptVersion
          console.log("Electrical AI analysis result:", JSON.stringify(result, null, 2))
        } catch (electricalError) {
          console.error("Electrical AI analysis failed at pipeline level:", electricalError)
          // Fallback to manual review if AI fails at this level
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
        // Use specialized Asbestos AI analyzer
        try {
          console.log("=== ASBESTOS ANALYSIS START ===")
          console.log("Running Asbestos AI analysis")
          const asbestosResult = await analyzeAsbestosWithAI(extractedText)
          result = asbestosResult.result
          modelName = asbestosResult.modelName
          promptVersion = asbestosResult.promptVersion
          console.log("Asbestos AI analysis result:", JSON.stringify(result, null, 2))
        } catch (asbestosError) {
          console.error("Asbestos AI analysis failed at pipeline level:", asbestosError)
          // Fallback to manual review if AI fails at this level
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
      // Unknown document type - default to green
      result = {
        status: "green" as const,
        summary: "Document reviewed - unknown type",
        flags: [],
      }
    }

    // For non-EPC documents, determine if we should use LLM fallback
    if (documentTypeName !== "EPC" && documentTypeName) {
      const confidence = result.confidence || calculateConfidence(result, extractedText)
      result.confidence = confidence

      console.log("Rule-based analysis result:", JSON.stringify(result, null, 2))
      console.log("Confidence:", confidence)

      // Determine if we should use LLM
      const shouldUseLLM =
        confidence < 0.5 || result.summary.trim().length === 0

      // Run LLM analysis if confidence is low or summary is empty
      if (shouldUseLLM) {
        try {
          console.log("Running LLM analysis due to low confidence or empty summary")
          const llmResult = await analyzeWithLLM(extractedText, documentTypeName)
          result = {
            status: llmResult.result.status,
            summary: llmResult.result.summary,
            flags: llmResult.result.flags,
            confidence: llmResult.result.confidence || confidence,
          }
          modelName = llmResult.modelName
          promptVersion = llmResult.promptVersion
          console.log("LLM analysis result:", JSON.stringify(result, null, 2))
        } catch (llmError) {
          console.error("LLM analysis failed:", llmError)
          // Continue with rule-based result if LLM fails
          // Don't fail the whole operation
        }
      }
    }

    // Update analysis_run with result and status = 'done'
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

    // Insert red_flags if status is orange or red
    if (result.status === "orange" || result.status === "red") {
      const flagsToInsert = result.flags.map((flag) => ({
        document_id: documentId,
        severity: flag.severity,
        title: flag.title,
        details: flag.details,
      }))

      const { error: flagsError } = await supabase
        .from("red_flags")
        .insert(flagsToInsert)

      if (flagsError) {
        console.error("Failed to insert red flags:", flagsError)
        // Don't fail the whole operation if flags insertion fails
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

    return { success: true, result }
    } catch (pipelineError) {
      const msg =
        pipelineError instanceof Error ? pipelineError.message : "Unknown error occurred"
      await markRunFailed(msg)
      return { error: msg, persistedToDb: true as const }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      persistedToDb: false as const,
    }
  }
}
