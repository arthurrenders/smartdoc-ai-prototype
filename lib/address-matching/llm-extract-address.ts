import "server-only"
import { z } from "zod"
import { GEMINI_MODEL, generateContentWithRetry } from "@/lib/ai/gemini"
import { getTextFromGeminiResponse } from "@/lib/ai/json-from-model"
import type { ExtractedPropertyAddress } from "@/lib/property-address/types"
import {
  structuredAddressFromSchemaFields,
  extractBelgianAddressFromPdfText,
} from "@/lib/property-address/extract-from-analysis"
import { normalizePdfTextForAddressExtraction } from "@/lib/pdf/normalize-text"

const PROMPT_VERSION = "address_extract_v3"

const MAX_CHARS_PER_CALL = 72_000

const LlmAddressSchema = z.object({
  street: z.string().nullable().optional(),
  house_number: z.string().nullable().optional(),
  box: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  municipality: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  /** Full single-line address if structured fields are uncertain (optional). */
  raw_line1: z.string().nullable().optional(),
  /** 0–1 confidence this is the subject property / building address */
  confidence: z.number().min(0).max(1),
})

function stripJsonFences(raw: string): string {
  return raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim()
}

function parseJsonLoose(content: string): unknown {
  const cleaned = stripJsonFences(content)
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf("{")
    const end = cleaned.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function buildLlmChunks(normalized: string): string[] {
  if (normalized.length <= MAX_CHARS_PER_CALL) {
    return [normalized]
  }
  const chunks: string[] = []
  chunks.push(normalized.slice(0, MAX_CHARS_PER_CALL))
  const midStart = Math.max(0, Math.floor(normalized.length / 2) - Math.floor(MAX_CHARS_PER_CALL / 2))
  chunks.push(normalized.slice(midStart, midStart + MAX_CHARS_PER_CALL))
  chunks.push(normalized.slice(Math.max(0, normalized.length - MAX_CHARS_PER_CALL)))
  const seen = new Set<string>()
  return chunks.filter((c) => {
    if (seen.has(c)) return false
    seen.add(c)
    return c.length > 80
  })
}

const SYSTEM_INSTRUCTIONS = `You extract the postal address of the BUILDING or SUBJECT PROPERTY (the asset being certified or inspected).

Rules:
- Return a single JSON object only. No markdown fences.
- You MUST output any complete address you find that clearly refers to that property (street / number / bus if present, 4-digit Belgian postcode, municipality). A country name (Belgium, België, BE) may appear — put it in municipality or omit it.
- Prefer the inspected object's address over the consultant's office, template headers, or issuing authority — unless the document only lists one address for the subject.
- If the text is messy (line breaks, labels like "Adres:"), infer street, house_number, box, postal_code, and municipality anyway.
- Belgian postcodes are four digits (1000–9999), sometimes written as B-3000 or BE-3000.
- If structured fields are ambiguous but one address line is obvious, fill "raw_line1" with that full line and set confidence accordingly.
- If there is genuinely no address in this excerpt, set confidence below 0.3 and use nulls.

Schema:
{"street": string|null,"house_number": string|null,"box": string|null,"postal_code": string|null,"municipality": string|null,"region": string|null,"raw_line1": string|null,"confidence": number}`

async function extractFromSingleExcerpt(excerpt: string): Promise<{
  address: ExtractedPropertyAddress | null
  modelName: string
}> {
  const prompt = `${SYSTEM_INSTRUCTIONS}

Document excerpt:
${excerpt}`

  const response = await generateContentWithRetry({
    model: GEMINI_MODEL,
    contents: prompt,
  })
  const modelName = `${response.provider}:${response.model}`

  const content = getTextFromGeminiResponse(response)
  if (!content) return { address: null, modelName }

  const parsed = parseJsonLoose(content)
  if (parsed === null) return { address: null, modelName }

  const validated = LlmAddressSchema.safeParse(parsed)
  if (!validated.success) return { address: null, modelName }

  if (validated.data.confidence < 0.32) return { address: null, modelName }

  const structured = structuredAddressFromSchemaFields({
    street: validated.data.street,
    house_number: validated.data.house_number,
    box: validated.data.box,
    postal_code: validated.data.postal_code,
    municipality: validated.data.municipality,
    region: validated.data.region,
  })

  if (structured) {
    return {
      address: {
        ...structured,
        confidence: Math.min(structured.confidence, validated.data.confidence),
        extraction_source: "structured_ai",
      },
      modelName,
    }
  }

  const raw = validated.data.raw_line1?.trim()
  if (raw) {
    const fromLine = extractBelgianAddressFromPdfText(`${raw}\n`)
    if (fromLine) {
      return {
        address: {
          ...fromLine,
          confidence: Math.min(0.82, validated.data.confidence),
          extraction_source: "structured_ai",
        },
        modelName,
      }
    }
  }

  return { address: null, modelName }
}

/**
 * Extract the main building / certificate address from document text (Belgium-first).
 * Server-only Gemini — uses the full document in chunks when needed.
 */
export async function extractAddressWithLlm(text: string): Promise<{
  address: ExtractedPropertyAddress | null
  modelName: string
  promptVersion: string
}> {
  let modelName = GEMINI_MODEL
  const normalized = normalizePdfTextForAddressExtraction(text)
  if (normalized.length < 15) {
    return { address: null, modelName, promptVersion: PROMPT_VERSION }
  }

  const chunks = buildLlmChunks(normalized)
  for (let i = 0; i < chunks.length; i++) {
    const excerpt = chunks[i]
    const header =
      chunks.length > 1
        ? `[Part ${i + 1} of ${chunks.length} — same PDF; find the subject property address if present in this segment]\n\n`
        : ""
    try {
      const result = await extractFromSingleExcerpt(header + excerpt)
      modelName = result.modelName
      const address = result.address
      if (address) {
        return { address, modelName, promptVersion: PROMPT_VERSION }
      }
    } catch {
      /* try next chunk */
    }
  }

  return { address: null, modelName, promptVersion: PROMPT_VERSION }
}
