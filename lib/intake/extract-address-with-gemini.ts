import "server-only"

import { z } from "zod"
import { generateContentWithRetry, GEMINI_MODEL } from "@/lib/ai/gemini"
import { INTAKE_ADDRESS_PROMPT } from "@/lib/ai/prompts/intake-address"
import { structuredAddressFromSchemaFields } from "@/lib/property-address/extract-from-analysis"
import type { ExtractedPropertyAddress } from "@/lib/property-address/types"

const PROMPT_VERSION = "1.0"

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
  const rawFromAi = data.raw_line1?.trim() || null
  const postalFromFields = normalizeBelgianPostal(data.postal_code ?? null)
  const postalFromLine =
    normalizeBelgianPostal(rawFromAi ?? "") ||
    normalizeBelgianPostal(
      [data.street_name, data.house_number, data.municipality].filter(Boolean).join(" ")
    )
  const postal = postalFromFields ?? postalFromLine
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

  if (structured) {
    const raw_line1 = (rawFromAi && rawFromAi.length > 5 ? rawFromAi : structured.raw_line1).slice(0, 500)
    const confidence = Math.max(0, Math.min(1, data.confidence))
    return {
      ...structured,
      raw_line1,
      confidence,
      extraction_source: "structured_ai",
    }
  }

  // Model returned street + city but no valid 4-digit BE postcode (common with Groq). Still useful for intake matching + manual confirm.
  const hasStreetHouse = Boolean(street && house)
  const hasUsableRaw = Boolean(rawFromAi && rawFromAi.length > 8)
  if (!municipality || (!hasStreetHouse && !hasUsableRaw)) {
    return null
  }

  const streetPart = [street, house].filter(Boolean).join(" ").trim()
  const raw_line1 = (
    rawFromAi && rawFromAi.length > 5
      ? rawFromAi
      : streetPart
        ? `${streetPart}, ${municipality}`
        : municipality
  ).slice(0, 500)

  const baseConf = Math.max(0, Math.min(1, data.confidence))
  const confidence = baseConf * 0.92

  return {
    raw_line1,
    street_name: street || null,
    house_number: house || null,
    box,
    postal_code: null,
    municipality,
    region: null,
    confidence,
    extraction_source: "structured_ai",
  }
}

/**
 * Uses the same Gemini stack as EPC / asbestos / electrical analyzers to infer a Belgian building address
 * from PDF-extracted text. Returns `null` if the model is unsure, JSON is invalid, or fields fail validation.
 */
export async function extractIntakePropertyAddressWithGemini(
  documentText: string
): Promise<{
  address: ExtractedPropertyAddress | null
  modelName: string
  promptVersion: string
  rawOutput: string | null
  parsed: z.infer<typeof IntakeGeminiAddressSchema> | null
}> {
  let modelName = GEMINI_MODEL

  try {
    const normalized = normalizeText(documentText)
    const textToSend = normalized.substring(0, 12_000)
    const isTruncated = normalized.length > 12_000

    const prompt = `${INTAKE_ADDRESS_PROMPT}\n\nDocument text:\n\n${textToSend}${
      isTruncated ? "\n\n[Document truncated for length]" : ""
    }`

    const response = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents: prompt,
    })
    modelName = `${response.provider}:${response.model}`

    const content = response.text
    if (!content?.trim()) {
      console.warn("[intake] Gemini address: empty response")
      return { address: null, modelName, promptVersion: PROMPT_VERSION, rawOutput: null, parsed: null }
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
      return { address: null, modelName, promptVersion: PROMPT_VERSION, rawOutput: content, parsed: null }
    }

    const parsedResult = IntakeGeminiAddressSchema.safeParse(parsed)
    if (!parsedResult.success) {
      console.warn("[intake] Gemini address: schema validation failed", parsedResult.error.flatten())
      return { address: null, modelName, promptVersion: PROMPT_VERSION, rawOutput: content, parsed: null }
    }

    const address = toExtractedAddress(parsedResult.data)
    if (address && parsedResult.data.extraction_notes) {
      console.info("[intake] Gemini address notes:", parsedResult.data.extraction_notes)
    }
    console.info(
      `[intake] Gemini address model=${modelName} conf=${Math.max(0, Math.min(1, parsedResult.data.confidence)).toFixed(2)}`
    )

    return { address, modelName, promptVersion: PROMPT_VERSION, rawOutput: content, parsed: parsedResult.data }
  } catch (e) {
    console.warn("[intake] Gemini address: request failed", e instanceof Error ? e.message : e)
    return { address: null, modelName, promptVersion: PROMPT_VERSION, rawOutput: null, parsed: null }
  }
}
