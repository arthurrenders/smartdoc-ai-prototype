import type { AnalysisResult } from "@/lib/analysis/detectors"
import type { ExtractedPropertyAddress } from "@/lib/property-address/types"
import { parseJsonFromModelOutput } from "@/lib/ai/json-from-model"

const MIN_CONFIDENCE = 0.72

/** Returns a 4-digit Belgian postcode string or null if invalid / missing. */
export function normalizeBelgianPostalCode(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const digits = String(raw).replace(/\D/g, "")
  if (digits.length === 4 && /^[1-9]\d{3}$/.test(digits)) return digits
  return null
}

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
  if (s.includes("could not complete automatic analysis")) return true
  if (s.includes("quota exceeded") || s.includes("rate limit") || s.includes("daily quota")) return true
  if (r.flags.some((f) => f.title === "Wrong document type")) return true
  if (r.flags.some((f) => f.title === "API quota exceeded")) return true
  if (r.flags.some((f) => f.title === "Empty model response")) return true
  if (r.flags.some((f) => f.title === "Manual review required")) return true
  if (r.flags.some((f) => f.title === "Analysis incomplete")) return true
  if (r.flags.some((f) => f.title === "Incomplete automatic extraction")) return true
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

function stringField(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "string") {
    const t = v.trim()
    return t === "" ? null : t
  }
  return String(v).trim() || null
}

function addressFromLooseObject(o: Record<string, unknown>): ExtractedPropertyAddress | null {
  const postal = normalizeBelgianPostalCode(
    stringField(
      o.property_postal_code ?? o.postal_code ?? o.postcode ?? o.zip ?? o.zipCode
    )
  )
  const mun = stringField(
    o.property_municipality ??
      o.municipality ??
      o.city ??
      o.gemeente ??
      o.commune
  )
  if (!postal || !mun) return null
  const structured = structuredAddressFromSchemaFields({
    street: stringField(
      o.property_street ?? o.street ?? o.street_name ?? o.straat ?? o.streetName
    ),
    house_number: stringField(
      o.property_house_number ?? o.house_number ?? o.huisnummer ?? o.houseNumber
    ),
    box: stringField(o.property_box ?? o.box ?? o.bus),
    postal_code: postal,
    municipality: mun,
    region: stringField(o.property_region ?? o.region ?? o.province),
  })
  if (!structured) return null
  return {
    ...structured,
    extraction_source: "embedded_json",
    confidence: 0.79,
  }
}

/**
 * Scan PDF text for JSON-like blobs (e.g. embedded metadata) that contain address keys.
 */
export function extractAddressFromEmbeddedJsonLikeContent(
  text: string
): ExtractedPropertyAddress | null {
  const maxScan = Math.min(text.length, 120_000)
  let attempts = 0
  for (let i = 0; i < maxScan; i++) {
    if (text[i] !== "{") continue
    if (attempts++ > 400) break
    const tail = text.slice(i, i + 8000)
    const parsed = parseJsonFromModelOutput(tail)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue
    const addr = addressFromLooseObject(parsed as Record<string, unknown>)
    if (addr) return addr
  }
  return null
}

const ADDRESS_KEYWORD_RE = /\b(adres|address|woonunit|gebouw|locatie)\b/gi

/**
 * Run the Belgian line heuristic on short windows around address-related keywords.
 */
export function extractBelgianAddressNearKeywords(text: string): ExtractedPropertyAddress | null {
  const slice = text.slice(0, 45_000)
  let best: ExtractedPropertyAddress | null = null
  ADDRESS_KEYWORD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ADDRESS_KEYWORD_RE.exec(slice)) !== null) {
    const start = Math.max(0, m.index - 160)
    const end = Math.min(slice.length, m.index + 960)
    const windowText = slice.slice(start, end)
    const hit = extractBelgianAddressFromPdfText(windowText)
    if (!hit) continue
    const candidate: ExtractedPropertyAddress = {
      ...hit,
      extraction_source: "keyword_context",
      confidence: Math.min(hit.confidence, 0.76),
    }
    if (!best || candidate.confidence > best.confidence) best = candidate
  }
  return best
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
