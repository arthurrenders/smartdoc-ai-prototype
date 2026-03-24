import type { AnalysisResult } from "@/lib/analysis/detectors"
import type { ExtractedPropertyAddress } from "@/lib/property-address/types"

const MIN_CONFIDENCE = 0.72

export function structuredAddressFromSchemaFields(fields: {
  street?: string | null | undefined
  house_number?: string | null | undefined
  box?: string | null | undefined
  postal_code?: string | null | undefined
  municipality?: string | null | undefined
  region?: string | null | undefined
}): ExtractedPropertyAddress | null {
  const postal = fields.postal_code?.trim()
  const mun = fields.municipality?.trim()
  if (!postal || !mun) return null
  if (!/^[1-9]\d{3}$/.test(postal)) return null

  const st = fields.street?.trim() || ""
  const hn = fields.house_number?.trim() || ""
  const box = fields.box?.trim() || null

  const streetPart = [st, hn].filter(Boolean).join(" ").trim()
  const tail = `${postal} ${mun}`
  const raw_line1 = (streetPart ? `${streetPart}, ${tail}` : tail).slice(0, 500)

  return {
    raw_line1,
    street_name: st || null,
    house_number: hn || null,
    box,
    postal_code: postal,
    municipality: mun,
    region: fields.region?.trim() ?? null,
    confidence: 0.84,
    extraction_source: "structured_ai",
  }
}

function isUnreliableAnalysisResult(r: AnalysisResult): boolean {
  const s = r.summary.toLowerCase()
  if (s.includes("wrong document type")) return true
  if (s.includes("ai analysis failed")) return true
  if (r.flags.some((f) => f.title === "Wrong document type")) return true
  if (r.flags.some((f) => f.title === "Manual review required")) return true
  return false
}

/**
 * Belgium-first line heuristic: one line matching "… 3000 Gemeente" with unique match in the excerpt.
 */
export function extractBelgianAddressFromPdfText(text: string): ExtractedPropertyAddress | null {
  const slice = text.slice(0, 20_000)
  const lines = slice
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8)

  type Hit = { line: string; streetPart: string; postal: string; municipality: string }
  const hits: Hit[] = []

  for (const line of lines) {
    const m = line.match(/^(.+?)\s+([1-9]\d{3})\s+([A-Za-zÀ-ÿ0-9](?:[A-Za-zÀ-ÿ0-9\s\-'.]+[A-Za-zÀ-ÿ0-9])?)$/i)
    if (!m) continue
    const streetPart = m[1].trim().replace(/\s+/g, " ")
    const postal = m[2]
    const municipality = m[3].trim().replace(/\s+/g, " ")
    if (streetPart.length < 3 || municipality.length < 2) continue
    if (!/^[1-9]\d{3}$/.test(postal)) continue
    hits.push({ line, streetPart, postal, municipality })
  }

  if (hits.length !== 1) return null

  const { line, streetPart, postal, municipality } = hits[0]

  let street_name: string | null = null
  let house_number: string | null = null
  let box: string | null = null

  const busM = streetPart.match(/^(.+?)\s+bus\s+([A-Za-z0-9]+)$/i)
  if (busM) {
    const front = busM[1].trim()
    box = busM[2].trim()
    const numM = front.match(/^(.+?)\s+(\d+[A-Za-z]?)$/i)
    if (numM) {
      street_name = numM[1].trim() || null
      house_number = numM[2].trim()
    } else {
      street_name = front || null
    }
  } else {
    const numM = streetPart.match(/^(.+?)\s+(\d+[A-Za-z]?)$/i)
    if (numM) {
      street_name = numM[1].trim() || null
      house_number = numM[2].trim()
    } else {
      street_name = streetPart || null
    }
  }

  return {
    raw_line1: line.slice(0, 500),
    street_name,
    house_number,
    box,
    postal_code: postal,
    municipality,
    region: null,
    confidence: 0.74,
    extraction_source: "text_heuristic",
  }
}

/**
 * Priority: structured `result.property_address` (from analyzers), else Belgium heuristic on PDF text.
 */
export function extractPropertyAddressCandidate(
  result: AnalysisResult,
  extractedText: string
): ExtractedPropertyAddress | null {
  if (isUnreliableAnalysisResult(result)) return null

  const fromResult = result.property_address
  if (
    fromResult &&
    fromResult.confidence >= MIN_CONFIDENCE &&
    fromResult.raw_line1?.trim()
  ) {
    return fromResult
  }

  const fromText = extractBelgianAddressFromPdfText(extractedText)
  if (fromText && fromText.confidence >= MIN_CONFIDENCE) {
    return fromText
  }

  return null
}
