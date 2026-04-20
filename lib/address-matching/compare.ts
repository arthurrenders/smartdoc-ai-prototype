import type { ExtractedPropertyAddress } from "@/lib/property-address/types"
import type { PropertyAddressRecord } from "@/lib/property-address/types"
import type { AddressMatchOutcome, AddressMatchStatus } from "./types"
import { buildCanonicalExpectedAddress } from "./expected-address"
import { normalizeBelgianPostalCode } from "@/lib/property-address/extract-from-analysis"

function normalizeComparable(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function diceCoefficient(a: string, b: string): number {
  if (!a.length || !b.length) return 0
  if (a.length < 2 && b.length < 2) return a === b ? 1 : 0
  if (a.length < 2) return b.includes(a) ? 0.85 : 0
  if (b.length < 2) return a.includes(b) ? 0.85 : 0

  const bigrams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2)
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1)
  }
  let intersections = 0
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2)
    const count = bigrams.get(bg) || 0
    if (count > 0) {
      intersections++
      bigrams.set(bg, count - 1)
    }
  }
  return (2 * intersections) / (a.length + b.length - 2)
}

function tokenOverlap(a: string, b: string): boolean {
  const na = normalizeComparable(a)
  const nb = normalizeComparable(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const ta = new Set(na.split(" ").filter((w) => w.length > 2))
  const tb = new Set(nb.split(" ").filter((w) => w.length > 2))
  for (const w of ta) {
    if (tb.has(w)) return true
  }
  return false
}

/**
 * Postcode is treated as stated on the document only from structured data or a clear postcode+city pattern
 * (avoids treating random 4-digit numbers as postcodes).
 */
function documentPostalStated(
  extracted: ExtractedPropertyAddress | null,
  extractedLine: string
): string | null {
  const fromField = normalizeBelgianPostalCode(extracted?.postal_code)
  if (fromField) return fromField
  const m = extractedLine.match(/\b([1-9]\d{3})\s+[A-Za-zÀ-ÿ]/)
  return m ? m[1] : null
}

function propertyPostalStated(row: PropertyAddressRecord | null, expectedLine: string): string | null {
  const fromField = normalizeBelgianPostalCode(row?.postal_code)
  if (fromField) return fromField
  const m = expectedLine.match(/\b([1-9]\d{3})\b/)
  return m ? m[1] : null
}

function regionStatedConflict(
  docRegion: string | null | undefined,
  propRegion: string | null | undefined
): boolean {
  const a = docRegion?.trim()
  const b = propRegion?.trim()
  if (!a || !b) return false
  if (tokenOverlap(a, b)) return false
  return true
}

function inferCountryCodeFromDocument(extracted: ExtractedPropertyAddress | null, line: string): string | null {
  const t = `${line} ${extracted?.region ?? ""}`.toLowerCase()
  if (/\b(belgium|belgië|belgique|belgien)\b/.test(t)) return "BE"
  if (/\b(nederland|netherlands|pays-bas)\b/.test(t) || /\bnl\b/.test(t)) return "NL"
  if (/\b(france|frankrijk)\b/.test(t) || /\bfr\b/.test(t)) return "FR"
  if (/\b(deutschland|germany|allemagne)\b/.test(t) || /\bde\b/.test(t)) return "DE"
  return null
}

function countryStatedConflict(docCode: string | null, propCode: string | null | undefined): boolean {
  const p = propCode?.trim().toUpperCase()
  const d = docCode?.trim().toUpperCase()
  if (!p || !d) return false
  return p !== d
}

function houseNumbersConflict(
  extracted: ExtractedPropertyAddress | null,
  row: PropertyAddressRecord | null
): boolean {
  const hE = extracted?.house_number?.trim()
  const hR = row?.house_number?.trim()
  if (!hE || !hR) return false
  return normalizeComparable(hE) !== normalizeComparable(hR)
}

type StreetMatch = "strong" | "weak" | "none"

function streetMatchLevel(
  extracted: ExtractedPropertyAddress | null,
  row: PropertyAddressRecord | null,
  diceFullLines: number
): StreetMatch {
  const sE = extracted?.street_name?.trim()
  const sR = row?.street_name?.trim()
  if (sE && sR) {
    const d = diceCoefficient(normalizeComparable(sE), normalizeComparable(sR))
    if (d >= 0.62 || tokenOverlap(sE, sR)) return "strong"
    if (d >= 0.35) return "weak"
    return "none"
  }
  if (diceFullLines >= 0.78) return "strong"
  if (diceFullLines >= 0.52) return "weak"
  return "none"
}

function cityMatches(
  extracted: ExtractedPropertyAddress | null,
  row: PropertyAddressRecord | null,
  extractedLine: string,
  expectedLine: string
): boolean {
  const mE = extracted?.municipality?.trim()
  const mR = row?.municipality?.trim()
  if (mE && mR) return tokenOverlap(mE, mR)
  return tokenOverlap(extractedLine, expectedLine)
}

function combineConfidence(extractionConfidence: number, matchScore: number): number {
  const c = extractionConfidence * 0.35 + matchScore * 0.65
  return Math.round(Math.min(1, Math.max(0, c)) * 100) / 100
}

/**
 * Compare document address to property: street, house number, and city are primary (not a one-to-one copy).
 * Postcode / region / country: mismatch only when **both** sides state a value and they disagree.
 * If zip, region, or country is missing on the document, that alone does not make the address wrong.
 */
export function matchExtractedAddressToProperty(
  extracted: ExtractedPropertyAddress | null,
  propertyAddressRow: PropertyAddressRecord | null
): AddressMatchOutcome {
  const expectedAddress = buildCanonicalExpectedAddress(propertyAddressRow)
  const extractedDocumentAddress = extracted?.raw_line1?.trim() || null

  const extractionConfidence = extracted?.confidence ?? 0

  if (!expectedAddress) {
    return {
      status: "unknown",
      confidence: combineConfidence(extractionConfidence || 0.2, 0.25),
      reason:
        "No canonical address is stored for this property yet, so the document could not be checked against a reliable record.",
      expectedAddress: null,
      extractedDocumentAddress,
      extracted,
    }
  }

  if (!extractedDocumentAddress) {
    return {
      status: "unknown",
      confidence: combineConfidence(extractionConfidence || 0.15, 0.2),
      reason:
        "No clear street address was found in the PDF (it may be scanned, redacted, or formatted unusually).",
      expectedAddress,
      extractedDocumentAddress: null,
      extracted,
    }
  }

  const nExp = normalizeComparable(expectedAddress)
  const nExt = normalizeComparable(extractedDocumentAddress)
  const diceFull = diceCoefficient(nExp, nExt)

  if (nExp === nExt) {
    return {
      status: "match",
      confidence: combineConfidence(Math.max(extractionConfidence, 0.75), 0.98),
      reason: "The document address matches the property record.",
      expectedAddress,
      extractedDocumentAddress,
      extracted,
    }
  }

  const postalDoc = documentPostalStated(extracted, extractedDocumentAddress)
  const postalProp = propertyPostalStated(propertyAddressRow, expectedAddress)
  const postalConflict =
    postalDoc !== null && postalProp !== null && postalDoc !== postalProp

  const regionConflict = regionStatedConflict(extracted?.region, propertyAddressRow?.region)

  const docCountry = inferCountryCodeFromDocument(extracted, extractedDocumentAddress)
  const propCountry = propertyAddressRow?.country_code?.trim().toUpperCase() || null
  const countryConflict = countryStatedConflict(docCountry, propCountry)

  if (postalConflict) {
    return {
      status: "mismatch",
      confidence: combineConfidence(extractionConfidence, 0.2),
      reason: `The document gives postal code ${postalDoc}, but the property is recorded as ${postalProp}. Street and city may look similar, but these postcodes do not match.`,
      expectedAddress,
      extractedDocumentAddress,
      extracted,
    }
  }

  if (regionConflict) {
    return {
      status: "mismatch",
      confidence: combineConfidence(extractionConfidence, 0.22),
      reason: `The document names a different region (${extracted?.region?.trim()}) than the property record (${propertyAddressRow?.region?.trim()}).`,
      expectedAddress,
      extractedDocumentAddress,
      extracted,
    }
  }

  if (countryConflict) {
    return {
      status: "mismatch",
      confidence: combineConfidence(extractionConfidence, 0.22),
      reason: `The document indicates a different country than the property on file (${docCountry} vs ${propCountry}).`,
      expectedAddress,
      extractedDocumentAddress,
      extracted,
    }
  }

  const cityOk = cityMatches(extracted, propertyAddressRow, extractedDocumentAddress, expectedAddress)
  const streetLvl = streetMatchLevel(extracted, propertyAddressRow, diceFull)
  const houseConflict = houseNumbersConflict(extracted, propertyAddressRow)

  let status: AddressMatchStatus
  let matchScore: number
  let reason: string

  if (!cityOk) {
    if (streetLvl === "none" && diceFull < 0.35) {
      status = "mismatch"
      matchScore = 0.2
      reason =
        "The city or municipality does not align with the property, and the street line is not a close match."
    } else {
      status = "possible_match"
      matchScore = 0.48
      reason =
        "The municipality differs or is abbreviated compared to the property record. Check that this certificate is for the same location."
    }
  } else if (streetLvl === "strong" && !houseConflict) {
    status = "match"
    matchScore = 0.88
    reason =
      "Street, house number, and city match the property record. Postcode, region, and country were only compared when both the document and the property stated them; missing details on the document were not treated as a mismatch."
    if (!postalDoc && postalProp) {
      reason +=
        " The document does not state a postal code, so no postcode conflict was applied."
    }
  } else if (streetLvl === "strong" && houseConflict) {
    status = "possible_match"
    matchScore = 0.66
    reason =
      "Street and city match, but the house numbers differ. Confirm this is not a neighbouring unit or a different entrance."
  } else if (streetLvl === "weak" && cityOk) {
    status = "possible_match"
    matchScore = 0.62
    reason =
      "City matches and the street is similar (abbreviation or spelling variant). Verify the building is the same."
  } else if (diceFull >= 0.55 && cityOk) {
    status = "possible_match"
    matchScore = 0.55
    reason =
      "Overall address text is fairly close and the city aligns, but the street name match is uncertain. Please confirm on the certificate."
  } else {
    status = "mismatch"
    matchScore = 0.25
    reason =
      "The street line does not match the property well enough compared to the stored street, even where city names may partially align."
  }

  return {
    status,
    confidence: combineConfidence(extractionConfidence, matchScore),
    reason,
    expectedAddress,
    extractedDocumentAddress,
    extracted,
  }
}
