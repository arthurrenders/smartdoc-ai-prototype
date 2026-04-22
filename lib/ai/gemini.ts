import "server-only"
import { ApiError, GoogleGenAI } from "@google/genai"

let _client: GoogleGenAI | undefined

function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set")
    _client = new GoogleGenAI({ apiKey })
  }
  return _client
}

/** Lazy-initialized Gemini client — does not throw at import time. */
export const geminiClient: GoogleGenAI = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    return getClient()[prop as keyof GoogleGenAI]
  },
})

/** Primary model (override with GEMINI_MODEL in .env.local). */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash"

/**
 * Optional fallback when the primary model hits 429 (e.g. separate free-tier bucket).
 * Set GEMINI_MODEL_FALLBACK in .env.local, e.g. gemini-2.0-flash.
 */
export const GEMINI_MODEL_FALLBACK = process.env.GEMINI_MODEL_FALLBACK?.trim() || ""

type GenerateContentRequest = Parameters<GoogleGenAI["models"]["generateContent"]>[0]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryDelayMsFromMessage(message: string): number | null {
  const m = message.match(/retry in ([\d.]+)\s*s/i)
  if (!m) return null
  const sec = parseFloat(m[1])
  if (!Number.isFinite(sec) || sec < 0) return null
  return Math.min(90_000, Math.ceil(sec * 1000) + 500)
}

function isRateLimited(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 429) return true
  const msg = error instanceof Error ? error.message : String(error)
  return msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")
}

/**
 * Calls generateContent with short backoff retries on 429, then one attempt on
 * GEMINI_MODEL_FALLBACK if configured and different from the primary model.
 */
export async function generateContentWithRetry(
  request: GenerateContentRequest
): Promise<Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>> {
  const primaryModel =
    typeof request.model === "string" ? request.model : GEMINI_MODEL
  let lastError: unknown

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await geminiClient.models.generateContent(request)
    } catch (e) {
      lastError = e
      if (!isRateLimited(e) || attempt === 2) break
      const msg = e instanceof Error ? e.message : String(e)
      const wait = retryDelayMsFromMessage(msg) ?? 5000 * (attempt + 1)
      console.warn(
        `[Gemini] Rate limited (429), waiting ${wait}ms before retry ${attempt + 2}/3 (model=${primaryModel})`
      )
      await sleep(wait)
    }
  }

  const fallback = GEMINI_MODEL_FALLBACK
  if (
    fallback &&
    fallback !== primaryModel &&
    lastError !== undefined &&
    isRateLimited(lastError)
  ) {
    console.warn(`[Gemini] Trying fallback model after 429: ${fallback}`)
    try {
      return await geminiClient.models.generateContent({
        ...(request as unknown as Record<string, unknown>),
        model: fallback,
      } as GenerateContentRequest)
    } catch (e) {
      lastError = e
    }
  }

  throw lastError
}

