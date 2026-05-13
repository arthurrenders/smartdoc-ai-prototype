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
      summary: "Gemini API-limiet of dagquota overschreden.",
      title: "API-quota overschreden",
      details:
        "De gratis laag laat een beperkt aantal aanvragen per dag per model toe. Wacht even en probeer opnieuw, activeer billing voor een hogere limiet of stel GEMINI_MODEL / GEMINI_MODEL_FALLBACK in .env.local in. Zie https://ai.google.dev/gemini-api/docs/rate-limits",
    }
  }

  if (status === 401 || status === 403) {
    return {
      summary: "Gemini API heeft de aanvraag geweigerd (authenticatie).",
      title: "API-toegang geweigerd",
      details:
        "Controleer GEMINI_API_KEY in .env.local en kijk na of de sleutel toegang heeft tot de Generative Language API.",
    }
  }

  if (status === 503 || message.toLowerCase().includes("unavailable")) {
    return {
      summary: "Gemini API is tijdelijk niet beschikbaar.",
      title: "Service tijdelijk niet beschikbaar",
      details: "Probeer straks opnieuw. Als dit blijft gebeuren, controleer https://status.cloud.google.com/",
    }
  }

  if (message.includes("No content in LLM response") || message.toLowerCase().includes("no usable")) {
    return {
      summary: "Het model gaf geen tekst terug voor deze aanvraag.",
      title: "Lege modelrespons",
      details:
        "De API antwoordde zonder tekst (geblokkeerd, gefilterd of lege kandidaten). Probeer een andere PDF-export of een ander model.",
    }
  }

  const trimmed = message.length > 600 ? `${message.slice(0, 600)}…` : message
  return {
    summary: "Automatische analyse kon niet worden afgerond voor dit document.",
    title: "Analyse onvolledig",
    details: trimmed || "De AI-aanvraag is mislukt of gaf geen bruikbare respons terug.",
  }
}
