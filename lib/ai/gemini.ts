import "server-only"
import { ApiError, GoogleGenAI } from "@google/genai"
import {
  assertWithinDailyBudget,
  BudgetExceededError,
  recordLlmCall,
} from "@/lib/ai/usage-budget"
import { getTextFromGeminiResponse } from "@/lib/ai/json-from-model"

export { BudgetExceededError } from "@/lib/ai/usage-budget"

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
export const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile"

type GenerateContentRequest = Parameters<GoogleGenAI["models"]["generateContent"]>[0]
type GeminiGenerateContentResponse = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>
type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

export type UnifiedGenerateContentResponse = {
  text?: string
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  provider: "gemini" | "groq"
  model: string
  raw: unknown
}

type GenerateContentRetryOptions = {
  /**
   * Optional caller validation for responses that need a parseable schema.
   * Throw from here to let the fallback provider attempt the same prompt.
   */
  validateText?: (text: string) => void
}

class ModelResponseValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelResponseValidationError"
  }
}

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

function shouldFallbackFromGemini(error: unknown): boolean {
  if (error === undefined || error === null) return false
  return true
}

function buildUnifiedGeminiResponse(
  response: GeminiGenerateContentResponse,
  model: string
): UnifiedGenerateContentResponse {
  return {
    text: response.text ?? undefined,
    candidates: (response as unknown as { candidates?: UnifiedGenerateContentResponse["candidates"] }).candidates,
    provider: "gemini",
    model,
    raw: response,
  }
}

function promptFromGenerateContentRequest(request: GenerateContentRequest): string {
  const contents = request.contents
  if (typeof contents === "string") return contents
  if (Array.isArray(contents)) {
    return contents
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text
          return typeof text === "string" ? text : ""
        }
        return ""
      })
      .filter(Boolean)
      .join("\n\n")
  }
  return ""
}

async function generateWithGroq(prompt: string): Promise<UnifiedGenerateContentResponse> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set")
  }

  await assertWithinDailyBudget("groq")

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Groq request failed (${resp.status}): ${body.slice(0, 400)}`)
  }

  const data = (await resp.json()) as GroqChatCompletionResponse
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error("Groq returned no content")
  }

  await recordLlmCall("groq")

  return {
    text: content,
    candidates: [{ content: { parts: [{ text: content }] } }],
    provider: "groq",
    model: GROQ_MODEL,
    raw: data,
  }
}

const MAX_GEMINI_RETRY_WAIT_MS = 5_000

async function validateUnifiedResponse(
  response: UnifiedGenerateContentResponse,
  options?: GenerateContentRetryOptions
): Promise<void> {
  const text = getTextFromGeminiResponse(response)
  if (!text) {
    throw new ModelResponseValidationError("Empty model response")
  }
  options?.validateText?.(text)
}

async function generateWithGeminiModel(
  request: GenerateContentRequest,
  model: string,
  options?: GenerateContentRetryOptions
): Promise<UnifiedGenerateContentResponse> {
  await assertWithinDailyBudget("gemini")
  const effectiveRequest =
    typeof request.model === "string" && request.model === model
      ? request
      : ({
          ...(request as unknown as Record<string, unknown>),
          model,
        } as GenerateContentRequest)
  const res = await geminiClient.models.generateContent(effectiveRequest)
  await recordLlmCall("gemini")
  const unified = buildUnifiedGeminiResponse(res, model)
  await validateUnifiedResponse(unified, options)
  return unified
}

/**
 * One Gemini attempt. If Gemini fails or returns unusable text, use the configured fallback provider
 * before surfacing an analysis failure. Groq is preferred when GROQ_API_KEY is set; otherwise an
 * alternate Gemini model is used when GEMINI_MODEL_FALLBACK is configured. Without either fallback,
 * rate-limit retries are kept short so server actions do not hang.
 *
 * The daily budget cap (LLM_MAX_CALLS_PER_DAY, default 200) is enforced before any provider call.
 * If one provider hits its cap, the next configured fallback is tried.
 */
export async function generateContentWithRetry(
  request: GenerateContentRequest,
  options?: GenerateContentRetryOptions
): Promise<UnifiedGenerateContentResponse> {
  const primaryModel =
    typeof request.model === "string" ? request.model : GEMINI_MODEL
  const canUseGroq = Boolean(process.env.GROQ_API_KEY?.trim())
  const prompt = promptFromGenerateContentRequest(request)
  let lastError: unknown

  try {
    return await generateWithGeminiModel(request, primaryModel, options)
  } catch (e) {
    lastError = e
  }

  if (canUseGroq && prompt && shouldFallbackFromGemini(lastError)) {
    console.warn(
      `[Gemini] Primary model failed (${primaryModel}); using Groq fallback (${GROQ_MODEL})`
    )
    try {
      const groq = await generateWithGroq(prompt)
      await validateUnifiedResponse(groq, options)
      return groq
    } catch (e) {
      lastError = e
      console.warn("[Groq] Fallback failed:", e instanceof Error ? e.message : e)
    }
  }

  const fallback = GEMINI_MODEL_FALLBACK
  if (fallback && fallback !== primaryModel && shouldFallbackFromGemini(lastError)) {
    console.warn(`[Gemini] Trying alternate Gemini model: ${fallback}`)
    try {
      return await generateWithGeminiModel(request, fallback, options)
    } catch (e) {
      lastError = e
    }
  }

  if (isRateLimited(lastError) && !canUseGroq && !fallback) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = lastError instanceof Error ? lastError.message : String(lastError)
      const fromApi = retryDelayMsFromMessage(msg)
      const wait = Math.min(fromApi ?? 2000 * (attempt + 1), MAX_GEMINI_RETRY_WAIT_MS)
      console.warn(
        `[Gemini] Rate limited (429), waiting ${wait}ms before retry ${attempt + 2}/2 (model=${primaryModel}, no GROQ_API_KEY)`
      )
      await sleep(wait)
      try {
        return await generateWithGeminiModel(request, primaryModel, options)
      } catch (e) {
        lastError = e
        if (!isRateLimited(e)) break
      }
    }
  }

  throw lastError
}

