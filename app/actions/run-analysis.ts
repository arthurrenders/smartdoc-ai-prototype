"use server"

import { createServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import pdf from "pdf-parse"
import {
  analyzeElectrical,
  analyzeEPC,
  analyzeAsbestos,
  calculateConfidence,
} from "@/lib/analysis/detectors"
import { analyzeWithLLM } from "@/lib/analysis/llm-analyzer"

const runAnalysisSchema = z.object({
  analysisRunId: z.string().uuid(),
  documentId: z.string().uuid(),
  propertyId: z.string().uuid(),
})

export async function runAnalysis(formData: FormData) {
  try {
    const analysisRunId = formData.get("analysisRunId") as string
    const documentId = formData.get("documentId") as string
    const propertyId = formData.get("propertyId") as string

    const validation = runAnalysisSchema.safeParse({
      analysisRunId,
      documentId,
      propertyId,
    })

    if (!validation.success) {
      return { error: "Invalid input data" }
    }

    const supabase = createServerClient()

    // Set status to 'processing'
    const { error: processingError } = await supabase
      .from("analysis_runs")
      .update({ status: "processing" })
      .eq("id", analysisRunId)

    if (processingError) {
      return { error: `Failed to start processing: ${processingError.message}` }
    }

    // Fetch document to get storage_path and document_type_id
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("storage_path, document_type_id, document_types(name)")
      .eq("id", documentId)
      .single()

    if (documentError || !document) {
      return { error: `Failed to fetch document: ${documentError?.message}` }
    }

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
      return { error: `Failed to download PDF: ${downloadError?.message}` }
    }

    // Convert Blob to Buffer for pdf-parse
    const arrayBuffer = await pdfBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text from PDF
    let extractedText: string
    try {
      const parsedPdf = await pdf(buffer)
      extractedText = parsedPdf.text
    } catch (parseError) {
      return {
        error: `Failed to parse PDF: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
      }
    }

    // Log first ~500 chars
    const preview = extractedText.substring(0, 500)
    console.log("Extracted PDF text (first 500 chars):", preview)
    console.log("Total text length:", extractedText.length)
    console.log("Document type:", documentTypeName)

    // Run rule-based analysis first
    let result
    if (documentTypeName === "ELECTRICAL") {
      result = analyzeElectrical(extractedText)
    } else if (documentTypeName === "EPC") {
      result = analyzeEPC(extractedText)
    } else if (documentTypeName === "ASBESTOS") {
      result = analyzeAsbestos(extractedText)
    } else {
      // Unknown document type - default to green
      result = {
        status: "green" as const,
        summary: "Document reviewed - unknown type",
        flags: [],
      }
    }

    // Calculate confidence for rule-based result
    const confidence = calculateConfidence(result, extractedText)
    result.confidence = confidence

    console.log("Rule-based analysis result:", JSON.stringify(result, null, 2))
    console.log("Confidence:", confidence)

    // Determine if we should use LLM
    const shouldUseLLM =
      confidence < 0.5 || result.summary.trim().length === 0

    let modelName: string | null = null
    let promptVersion: string | null = null

    // Run LLM analysis if confidence is low or summary is empty
    if (shouldUseLLM && documentTypeName) {
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
      return { error: `Failed to update analysis: ${updateError.message}` }
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

    revalidatePath(`/properties/${propertyId}`)

    return { success: true, result }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

