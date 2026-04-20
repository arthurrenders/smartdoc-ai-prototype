import "server-only"
import { ApiError } from "@google/genai"

export type UserFacingAiFailure = {
  summary: string
  title: string
  details: string
}

/**
 * Map Gemini / network errors to UI copy so quota (429) is not confused with "bad document".
 */
export function userFacingAnalysisFailureFromError(error: unknown): UserFacingAiFailure {
  const message = error instanceof Error ? error.message : String(error)
  const status = error instanceof ApiError ? error.status : undefined

  if (
    status === 429 ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("quota") ||
    message.includes("Quota exceeded")
  ) {
    return {
      summary: "Gemini API rate limit or daily quota exceeded.",
      title: "API quota exceeded",
      details:
        "The free tier allows a limited number of requests per day per model. Wait a few minutes and try again, enable billing for a higher limit, or set GEMINI_MODEL / GEMINI_MODEL_FALLBACK in .env.local. See https://ai.google.dev/gemini-api/docs/rate-limits",
    }
  }

  if (status === 401 || status === 403) {
    return {
      summary: "Gemini API rejected the request (authentication).",
      title: "API access denied",
      details:
        "Check GEMINI_API_KEY in .env.local and that the key is allowed for Generative Language API.",
    }
  }

  if (status === 503 || message.toLowerCase().includes("unavailable")) {
    return {
      summary: "Gemini API is temporarily unavailable.",
      title: "Service unavailable",
      details: "Retry shortly. If it persists, check https://status.cloud.google.com/",
    }
  }

  if (message.includes("No content in LLM response") || message.toLowerCase().includes("no usable")) {
    return {
      summary: "The model returned no text for this request.",
      title: "Empty model response",
      details:
        "The API responded without text (blocked, filtered, or empty candidates). Try another PDF export or a different model.",
    }
  }

  const trimmed = message.length > 600 ? `${message.slice(0, 600)}…` : message
  return {
    summary: "Could not complete automatic analysis for this document.",
    title: "Analysis incomplete",
    details: trimmed || "The AI request failed or returned no usable response.",
  }
}
