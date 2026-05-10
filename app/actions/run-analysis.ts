"use server"

import { createServerClient } from "@/lib/supabase/server"
import { z } from "zod"
import { executeAnalysisRunPipeline } from "@/lib/analysis/execute-analysis-run"
import { assertOwnerDocument } from "@/lib/supabase/ownership"

const runAnalysisSchema = z.object({
  analysisRunId: z.string().uuid(),
  documentId: z.string().uuid(),
  propertyId: z.string().uuid(),
  force: z.boolean().optional().default(false),
})

export async function runAnalysis(formData: FormData) {
  try {
    const analysisRunIdRaw = formData.get("analysisRunId") as string
    const documentIdRaw = formData.get("documentId") as string
    const propertyIdRaw = formData.get("propertyId") as string
    const forceRaw = formData.get("force")

    const validation = runAnalysisSchema.safeParse({
      analysisRunId: analysisRunIdRaw,
      documentId: documentIdRaw,
      propertyId: propertyIdRaw,
      force: forceRaw === "1" || forceRaw === "true",
    })

    if (!validation.success) {
      return { error: "Invalid input data", persistedToDb: false as const }
    }

    const { analysisRunId, documentId, propertyId, force } = validation.data
    const supabase = createServerClient()
    await assertOwnerDocument(supabase, documentId, propertyId)

    // Already-completed runs should not silently re-trigger Gemini calls. The UI shows a confirm
    // dialog before submitting with force=1; a missing flag on a done row means an unintended call.
    const { data: existingRun } = await supabase
      .from("analysis_runs")
      .select("id, status, result_json")
      .eq("id", analysisRunId)
      .maybeSingle()

    if (
      !force &&
      existingRun?.status === "done" &&
      existingRun.result_json != null
    ) {
      return {
        error: "Dit document is al geanalyseerd. Bevestig opnieuw analyseren om credits te verbruiken.",
        persistedToDb: false as const,
      }
    }

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

