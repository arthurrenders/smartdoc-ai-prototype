import "server-only"
import { z } from "zod"
import { LLMAnalysisResultSchema, type LLMAnalysisResult } from "./llm-schema"
import { geminiClient, GEMINI_MODEL } from "@/lib/ai/gemini"

const PROMPT_VERSION = "1.0"

const getSystemPrompt = (documentType: string): string => {
  return `You are an expert document analyst specializing in ${documentType} documents. 
Analyze the provided document text and identify any red flags, compliance issues, or concerns.

Return a JSON object with:
- status: "red" | "orange" | "green" (overall assessment)
- summary: A concise summary of the document analysis (required, cannot be empty)
- flags: Array of issues found, each with:
  - severity: "red" | "orange" | "green"
  - title: Brief title of the issue
  - details: Detailed description
- confidence: Optional number between 0 and 1 indicating your confidence in the analysis

Be thorough but accurate. Only flag genuine concerns.`
}

const getUserPrompt = (documentType: string, text: string): string => {
  return `Analyze this ${documentType} document:

${text.substring(0, 8000)}${text.length > 8000 ? "\n\n[Document truncated for length]" : ""}

Return only valid JSON matching the required schema.`
}

export async function analyzeWithLLM(
  text: string,
  documentType: string
): Promise<{ result: LLMAnalysisResult; modelName: string; promptVersion: string }> {
  const modelName = GEMINI_MODEL

  try {
    const prompt = `${getSystemPrompt(documentType)}\n\n${getUserPrompt(documentType, text)}`
    const response = await geminiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    })
    const content = response.text
    if (!content) {
      throw new Error("No content in LLM response")
    }

    // Parse JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (parseError) {
      throw new Error(`Failed to parse LLM JSON response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`)
    }

    // Validate with Zod
    const validated = LLMAnalysisResultSchema.parse(parsed)

    return {
      result: validated,
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`LLM output validation failed: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`)
    }
    throw error
  }
}

