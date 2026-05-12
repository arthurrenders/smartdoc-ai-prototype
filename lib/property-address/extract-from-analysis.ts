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

function cleanLabelValue(value: string | undefined): string | null {
  const v = value?.replace(/^[:.\-\s]+/, "").replace(/\s+/g, " ").trim()
  return v ? v : null
}

function readNextOrInlineValue(lines: string[], index: number, pattern: RegExp): string | null {
  const inline = lines[index].match(pattern)
  if (!inline) return null
  const value = cleanLabelValue(inline[1])
  if (value) return value
  const next = lines[index + 1]?.trim()
  return next && next.length > 1 ? next : null
}

/**
 * Strip address-label prefixes like "Adres", "Address", "ADRES INSTALLATIE", "Adres gebouw",
 * "Adres van het pand", and trailing punctuation (commas, periods, semicolons, colons).
 * Belgian government / inspection PDFs often render the address as
 * "ADRES INSTALLATIE: Blijde Inkomststraat 150, 3000 Leuven" or
 * "Adres Blijde Inkomststraat 150, 3000 Leuven" — both should reduce to the bare street+number form.
 */
function stripAddressLabelNoise(value: string): string {
  let v = value.trim()
  // Strip leading address-label words plus any descriptor words ("installatie", "gebouw", "pand",
  // "van het pand", "object", "subject"), with an optional trailing colon.
  v = v.replace(
    /^(?:adres|address|adress|adresse)(?:\s+(?:van\s+het\s+|van\s+|du\s+|de\s+)?(?:installatie|gebouw|pand|object|subject|bien|inspectie|onderzoek))?\s*[:\-]?\s*/i,
    ""
  )
  // Trim trailing punctuation that would block the "street + number" tail regex.
  v = v.replace(/[\s,;:.]+$/g, "")
  return v.trim()
}

function splitStreetHouse(value: string): {
  street_name: string | null
  house_number: string | null
  box: string | null
} {
  const cleaned = stripAddressLabelNoise(value)
  const bus = cleaned.match(/^(.+?)\s+(?:bus|box|busnummer)\s+([A-Za-z0-9-]+)$/i)
  const beforeBus = bus ? bus[1].trim() : cleaned
  const box = bus?.[2]?.trim() ?? null
  const num = beforeBus.match(/^(.+?)\s+(\d+[A-Za-z]?)$/i)
  return {
    street_name: (num ? num[1] : beforeBus).trim() || null,
    house_number: num?.[2]?.trim() || null,
    box,
  }
}

/**
 * Handles Belgian government-style PDFs that render addresses as labeled fields:
 * "Straat", "Nummer", "Gemeente", "Postcode", or "Straat + nr.:".
 */
function extractBelgianAddressFromKeyValueFields(lines: string[]): ExtractedPropertyAddress | null {
  let street: string | null = null
  let house: string | null = null
  let box: string | null = null
  let postal: string | null = null
  let municipality: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const streetNr = readNextOrInlineValue(lines, i, /^\s*Straat\s*\+\s*nr\.?\s*:?\s*(.*)$/i)
    if (streetNr) {
      const parsed = splitStreetHouse(streetNr)
      street = parsed.street_name ?? street
      house = parsed.house_number ?? house
      box = parsed.box ?? box
      continue
    }

    const streetOnly = readNextOrInlineValue(lines, i, /^\s*Straat\s*:?\s*(.*)$/i)
    if (streetOnly) {
      street = streetOnly
      continue
    }

    const number = readNextOrInlineValue(lines, i, /^\s*Nummer\s*:?\s*(.*)$/i)
    if (number) {
      const parsed = number.match(/^(\d+[A-Za-z]?)(?:\s+(?:bus|box)\s+([A-Za-z0-9-]+))?$/i)
      house = parsed?.[1]?.trim() ?? number
      box = parsed?.[2]?.trim() ?? box
      continue
    }

    const city = readNextOrInlineValue(lines, i, /^\s*Gemeente\s*:?\s*(.*)$/i)
    if (city) {
      municipality = city
      continue
    }

    // Belgian EPCs print the postcode under "Postnummer", not "Postcode". Accept both
    // (plus "Postnr." / "Postal code") so EPC key-value tables produce a complete address.
    // Use the inline-or-next-line reader so "Postnummer" alone on one line with "3000" on the next still resolves.
    const postRaw = readNextOrInlineValue(
      lines,
      i,
      /^\s*(?:Postcode|Postnummer|Postnr\.?|Postal\s*code)\s*:?\s*(.*)$/i
    )
    if (postRaw) {
      const m = postRaw.match(/\b([1-9]\d{3})\b/)
      if (m) {
        postal = m[1]
        continue
      }
    }
  }

  if (street && !house) {
    const parsed = splitStreetHouse(street)
    street = parsed.street_name
    house = parsed.house_number
    box = parsed.box ?? box
  }

  if (!street || !house) return null

  const streetPart = [street, house, box ? `bus ${box}` : null].filter(Boolean).join(" ")
  const tail = [postal, municipality].filter(Boolean).join(" ")
  return {
    raw_line1: (tail ? `${streetPart}, ${tail}` : streetPart).slice(0, 500),
    street_name: street,
    house_number: house,
    box,
    postal_code: postal,
    municipality,
    region: null,
    confidence: postal && municipality ? 0.86 : municipality ? 0.83 : 0.8,
    extraction_source: "keyword_context",
  }
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

  const keyValueHit = extractBelgianAddressFromKeyValueFields(lines)
  if (keyValueHit) return keyValueHit

  // First-pass signal: when a line explicitly labels an address, trust it before generic heuristics.
  // Examples: "adres: parkstraat 88" / "adress: parkstraat 88" /
  // "Adres installatie: Blijde Inkomststraat 150, 3000 Leuven" /
  // "Adres gebouw: …" / "Adres van het pand: …"
  for (const line of lines) {
    const labeled = line.match(
      /^[\"'“”]?(?:adres|address|adress|adresse)(?:\s+(?:van\s+het\s+|van\s+|du\s+|de\s+)?(?:installatie|gebouw|pand|object|subject|bien|inspectie|onderzoek))?[\"'“”]?\s*:\s*[\"'“”]?(.+?)[\"'“”]?$/i
    )
    if (!labeled) continue
    const candidate = labeled[1]?.trim() ?? ""
    if (!candidate) continue

    const withPostalAndCity = candidate.match(
      /^(.+?)(?:,\s*|\s+)([1-9]\d{3})\s+([A-Za-zÀ-ÿ0-9](?:[A-Za-zÀ-ÿ0-9\s\-'.]+[A-Za-zÀ-ÿ0-9])?)$/i
    )
    if (withPostalAndCity) {
      const streetPart = withPostalAndCity[1].trim().replace(/\s+/g, " ")
      const postal = withPostalAndCity[2]
      const municipality = withPostalAndCity[3].trim().replace(/\s+/g, " ")

      const numM = streetPart.match(/^(.+?)\s+(\d+[A-Za-z]?)$/i)
      return {
        raw_line1: candidate.slice(0, 500),
        street_name: (numM ? numM[1] : streetPart).trim() || null,
        house_number: numM?.[2]?.trim() || null,
        box: null,
        postal_code: postal,
        municipality,
        region: null,
        confidence: 0.82,
        extraction_source: "text_heuristic",
      }
    }

    const streetOnly = candidate.match(/^(.+?)\s+(\d+[A-Za-z]?)$/i)
    if (streetOnly) {
      return {
        raw_line1: candidate.slice(0, 500),
        street_name: streetOnly[1].trim() || null,
        house_number: streetOnly[2].trim(),
        box: null,
        postal_code: null,
        municipality: null,
        region: null,
        confidence: 0.8,
        extraction_source: "text_heuristic",
      }
    }
  }

  type Hit = { line: string; streetPart: string; postal: string; municipality: string }
  const hits: Hit[] = []

  for (const line of lines) {
    const m = line.match(/^(.+?)\s+([1-9]\d{3})\s+([A-Za-zÀ-ÿ0-9](?:[A-Za-zÀ-ÿ0-9\s\-'.]+[A-Za-zÀ-ÿ0-9])?)$/i)
    if (!m) continue
    // Reports like "ADRES INSTALLATIE: Blijde Inkomststraat 150, 3000 Leuven" and
    // "Adres Blijde Inkomststraat 150, 3000 Leuven" leave label words + a trailing comma
    // in streetPart, which then blocks the "<street> <number>" tail regex.
    const streetPart = stripAddressLabelNoise(m[1]).replace(/\s+/g, " ")
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
