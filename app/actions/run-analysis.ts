"use server"

import { createServerClient } from "@/lib/supabase/server"
import { z } from "zod"
import { executeAnalysisRunPipeline } from "@/lib/analysis/execute-analysis-run"

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

    const pipelineResult = await executeAnalysisRunPipeline(supabase, {
      analysisRunId,
      documentId,
      propertyId,
    })

    if ("error" in pipelineResult) {
      return {
        error: pipelineResult.error,
        persistedToDb: pipelineResult.persistedToDb,
      }
    }

    return { success: true, result: pipelineResult.result }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      persistedToDb: false as const,
    }
  }
}
