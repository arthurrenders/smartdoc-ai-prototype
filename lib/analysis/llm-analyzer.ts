import "server-only"
import { z } from "zod"
import { LLMAnalysisResultSchema, type LLMAnalysisResult } from "./llm-schema"
import { GEMINI_MODEL, generateContentWithRetry } from "@/lib/ai/gemini"
import { getTextFromGeminiResponse, parseJsonFromModelOutput } from "@/lib/ai/json-from-model"
import type { AnalysisResult } from "./detectors"
import { analyzeEPCWithAI } from "./epc-analyzer"
import { analyzeElectricalWithAI } from "./electrical-analyzer"
import { analyzeAsbestosWithAI } from "./asbestos-analyzer"

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

  // Route to specialized analyzers for known document types
  const normalizedType = documentType.toLowerCase()

  if (normalizedType === "epc") {
    const { result, modelName: aiModelName, promptVersion } = await analyzeEPCWithAI(text)
    return {
      result: result as LLMAnalysisResult,
      modelName: aiModelName,
      promptVersion,
    }
  }

  if (normalizedType === "electrical" || normalizedType === "electrical_inspection") {
    const { result, modelName: aiModelName, promptVersion } = await analyzeElectricalWithAI(text)
    return {
      result: result as AnalysisResult,
      modelName: aiModelName,
      promptVersion,
    }
  }

  if (normalizedType === "asbestos" || normalizedType === "asbestattest") {
    const { result, modelName: aiModelName, promptVersion } = await analyzeAsbestosWithAI(text)
    return {
      result: result as AnalysisResult,
      modelName: aiModelName,
      promptVersion,
    }
  }

  try {
    const prompt = `${getSystemPrompt(documentType)}\n\n${getUserPrompt(documentType, text)}`
    const response = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents: prompt,
    })
    const content = getTextFromGeminiResponse(response)
    if (!content) {
      throw new Error("No content in LLM response")
    }

    const parsed = parseJsonFromModelOutput(content)
    if (parsed === null) {
      throw new Error("Failed to parse LLM JSON response")
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

