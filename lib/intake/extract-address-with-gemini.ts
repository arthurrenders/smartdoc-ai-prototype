import "server-only"

import { z } from "zod"
import { geminiClient, GEMINI_MODEL } from "@/lib/ai/gemini"
import { INTAKE_ADDRESS_PROMPT } from "@/lib/ai/prompts/intake-address"
import { structuredAddressFromSchemaFields } from "@/lib/property-address/extract-from-analysis"
import type { ExtractedPropertyAddress } from "@/lib/property-address/types"

const PROMPT_VERSION = "1.0"

/** Minimum model-reported confidence to accept Gemini extraction for intake. */
const MIN_GEMINI_CONFIDENCE = 0.55

/** After validation, treat as usable for property matching only at or above this level. */
const MIN_USABLE_CONFIDENCE = 0.72

const IntakeGeminiAddressSchema = z.object({
  street_name: z.string().nullable().optional(),
  house_number: z.string().nullable().optional(),
  box: z.string().nullable().optional(),
  postal_code: z.union([z.string(), z.number()]).nullable().optional(),
  municipality: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  raw_line1: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  extraction_notes: z.string().nullable().optional(),
})

function normalizeText(text: string): string {
  let normalized = text.replace(/\s+/g, " ")
  normalized = normalized.replace(/\n{3,}/g, "\n\n")
  return normalized.trim()
}

function normalizeBelgianPostal(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  const m = s.match(/\b([1-9]\d{3})\b/)
  return m ? m[1] : null
}

function toExtractedAddress(data: z.infer<typeof IntakeGeminiAddressSchema>): ExtractedPropertyAddress | null {
  if (data.confidence < MIN_GEMINI_CONFIDENCE) {
    return null
  }

  const postal = normalizeBelgianPostal(data.postal_code ?? null)
  const municipality = data.municipality?.trim() || null
  const street = data.street_name?.trim() || ""
  const house = data.house_number?.trim() || ""
  const box = data.box?.trim() || null

  const structured = structuredAddressFromSchemaFields({
    street: street || null,
    house_number: house || null,
    box,
    postal_code: postal,
    municipality,
    region: null,
  })

  if (!structured) {
    return null
  }

  const rawFromAi = data.raw_line1?.trim()
  const raw_line1 = (rawFromAi && rawFromAi.length > 5 ? rawFromAi : structured.raw_line1).slice(0, 500)

  const blendedConfidence = Math.min(0.94, Math.max(MIN_USABLE_CONFIDENCE, data.confidence))

  return {
    ...structured,
    raw_line1,
    confidence: blendedConfidence,
    extraction_source: "structured_ai",
  }
}

/**
 * Uses the same Gemini stack as EPC / asbestos / electrical analyzers to infer a Belgian building address
 * from PDF-extracted text. Returns `null` if the model is unsure, JSON is invalid, or fields fail validation.
 */
export async function extractIntakePropertyAddressWithGemini(
  documentText: string
): Promise<{ address: ExtractedPropertyAddress | null; modelName: string; promptVersion: string }> {
  const modelName = GEMINI_MODEL

  try {
    const normalized = normalizeText(documentText)
    const textToSend = normalized.substring(0, 12_000)
    const isTruncated = normalized.length > 12_000

    const prompt = `${INTAKE_ADDRESS_PROMPT}\n\nDocument text:\n\n${textToSend}${
      isTruncated ? "\n\n[Document truncated for length]" : ""
    }`

    const response = await geminiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    })

    const content = response.text
    if (!content?.trim()) {
      console.warn("[intake] Gemini address: empty response")
      return { address: null, modelName, promptVersion: PROMPT_VERSION }
    }

    const cleaned = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch (e) {
      console.warn("[intake] Gemini address: JSON parse failed", e instanceof Error ? e.message : e)
      return { address: null, modelName, promptVersion: PROMPT_VERSION }
    }

    const parsedResult = IntakeGeminiAddressSchema.safeParse(parsed)
    if (!parsedResult.success) {
      console.warn("[intake] Gemini address: schema validation failed", parsedResult.error.flatten())
      return { address: null, modelName, promptVersion: PROMPT_VERSION }
    }

    const address = toExtractedAddress(parsedResult.data)
    if (address && parsedResult.data.extraction_notes) {
      console.info("[intake] Gemini address notes:", parsedResult.data.extraction_notes)
    }
    if (address) {
      console.info(`[intake] Gemini address ok model=${modelName} conf=${address.confidence.toFixed(2)}`)
    } else {
      console.info(
        `[intake] Gemini address rejected (low confidence or invalid BE fields) raw_conf=${parsedResult.data.confidence}`
      )
    }

    return { address, modelName, promptVersion: PROMPT_VERSION }
  } catch (e) {
    console.warn("[intake] Gemini address: request failed", e instanceof Error ? e.message : e)
    return { address: null, modelName, promptVersion: PROMPT_VERSION }
  }
}
