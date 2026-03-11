import { z } from "zod"

export const LLMAnalysisResultSchema = z.object({
  status: z.enum(["red", "orange", "green"]),
  summary: z.string().min(1, "Summary cannot be empty"),
  flags: z.array(
    z.object({
      severity: z.enum(["red", "orange", "green"]),
      title: z.string().min(1, "Title cannot be empty"),
      details: z.string(),
    })
  ),
  confidence: z.number().min(0).max(1).optional(),
})

export type LLMAnalysisResult = z.infer<typeof LLMAnalysisResultSchema>


