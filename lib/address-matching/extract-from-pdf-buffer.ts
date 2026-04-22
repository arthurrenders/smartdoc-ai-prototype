import "server-only"
import { extractTextFromPDF, extractTextFromPDFFallback } from "@/lib/pdf/extractor"
import {
  extractAddressFromEmbeddedJsonLikeContent,
  extractBelgianAddressFromPdfText,
  extractBelgianAddressNearKeywords,
} from "@/lib/property-address/extract-from-analysis"
import type { ExtractedPropertyAddress } from "@/lib/property-address/types"
import { extractAddressWithLlm } from "./llm-extract-address"

const HEURISTIC_MIN = 0.72

function pickStrongerHeuristic(
  a: ExtractedPropertyAddress | null,
  b: ExtractedPropertyAddress | null
): ExtractedPropertyAddress | null {
  if (!a) return b
  if (!b) return a
  if (b.confidence > a.confidence) return b
  if (a.confidence > b.confidence) return a
  if (b.extraction_source === "embedded_json" || b.extraction_source === "keyword_context") return b
  if (a.extraction_source === "embedded_json" || a.extraction_source === "keyword_context") return a
  return a
}

function pickStrongestOf(
  ...candidates: (ExtractedPropertyAddress | null)[]
): ExtractedPropertyAddress | null {
  return candidates.reduce<ExtractedPropertyAddress | null>(
    (best, cur) => pickStrongerHeuristic(best, cur),
    null
  )
}

/**
 * Pull text from a PDF buffer, then extract a property address (heuristic first, then Gemini).
 * For reuse from upload, email processing, or imports.
 */
export async function extractAddressFromPdfBuffer(pdfBuffer: Buffer): Promise<{
  extracted: ExtractedPropertyAddress | null
  plainText: string
}> {
  let plainText: string
  try {
    const info = await extractTextFromPDF(pdfBuffer)
    plainText = info.text || ""
  } catch {
    const info = await extractTextFromPDFFallback(pdfBuffer)
    plainText = info.text || ""
  }

  if (plainText.trim().length < 12) {
    return { extracted: null, plainText }
  }

  let fromEmbedded: ExtractedPropertyAddress | null = null
  try {
    fromEmbedded = extractAddressFromEmbeddedJsonLikeContent(plainText)
  } catch (e) {
    console.warn("extractAddressFromPdfBuffer: embedded JSON key scan failed", e)
  }

  const fromLines = extractBelgianAddressFromPdfText(plainText)
  const fromKeywords = extractBelgianAddressNearKeywords(plainText)
  const heuristic = pickStrongestOf(fromEmbedded, fromLines, fromKeywords)
  if (heuristic && heuristic.confidence >= HEURISTIC_MIN) {
    return { extracted: heuristic, plainText }
  }

  try {
    const { address } = await extractAddressWithLlm(plainText)
    if (address) {
      return { extracted: address, plainText }
    }
  } catch (e) {
    console.warn("extractAddressFromPdfBuffer: LLM extract failed", e)
  }

  const fallbackHeuristic = pickStrongestOf(fromEmbedded, fromLines, fromKeywords)
  if (fallbackHeuristic) {
    return { extracted: fallbackHeuristic, plainText }
  }

  return { extracted: null, plainText }
}
