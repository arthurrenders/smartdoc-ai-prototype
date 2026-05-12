import type { ExtractedPropertyAddress, PropertyAddressRecord } from "@/lib/property-address/types"
import { buildCanonicalExpectedAddress } from "./expected-address"
import { canonicalStreetForm, streetSimilarity } from "@/lib/intake/property-address-match"

/** Case-insensitive, trims whitespace, strips combining marks for stable comparison. */
export function normalizeAddressCoreField(s: string | null | undefined): string {
  if (!s) return ""
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
}

/**
 * Punctuation-insensitive variant: `Blijde-Inkomststraat` and `Blijde Inkomststraat` collapse to the
 * same key. Lets PDF extraction quirks (hyphen vs space, stray dots) stop causing false mismatches
 * on the property page's "Adres controleren" button.
 */
function normalizeAddressCoreFieldStrict(s: string | null | undefined): string {
  return normalizeAddressCoreField(s).replace(/[^a-z0-9]+/g, "")
}

/**
 * Two strings compare equal if they match exactly after diacritic stripping AND after
 * punctuation/whitespace collapse, OR their canonical street similarity is high.
 * Mirrors the matcher used during intake so verification is at least as forgiving.
 */
function streetFieldsEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAddressCoreField(a)
  const nb = normalizeAddressCoreField(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (normalizeAddressCoreFieldStrict(a) === normalizeAddressCoreFieldStrict(b)) return true
  return streetSimilarity(canonicalStreetForm(a), canonicalStreetForm(b)) >= 0.9
}

function municipalityFieldsEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAddressCoreField(a)
  const nb = normalizeAddressCoreField(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (normalizeAddressCoreFieldStrict(a) === normalizeAddressCoreFieldStrict(b)) return true
  // Sub-municipality / parent municipality tolerance (e.g. "Heverlee" ⊂ "Leuven Heverlee").
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true
  return false
}

function houseNumberFieldsEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeAddressCoreFieldStrict(a) === normalizeAddressCoreFieldStrict(b) && normalizeAddressCoreFieldStrict(a) !== ""
}

function hasCoreTriple(row: {
  street_name: string | null
  house_number: string | null
  municipality: string | null
} | null): boolean {
  if (!row) return false
  return (
    normalizeAddressCoreField(row.street_name) !== "" &&
    normalizeAddressCoreField(row.house_number) !== "" &&
    normalizeAddressCoreField(row.municipality) !== ""
  )
}

export type UploadAddressVerificationDbStatus = "match" | "possible_match" | "mismatch" | "unknown"

/**
 * Upload-time check: street name, house number, and municipality must be identical
 * (case-insensitive, trimmed). Missing region / country / postal on the document is ignored.
 */
export function verifyUploadAddressCoreFields(
  extracted: ExtractedPropertyAddress | null,
  propertyRow: PropertyAddressRecord | null
): {
  status: UploadAddressVerificationDbStatus
  confidence: number
  reason: string
  expectedAddress: string | null
  extractedDocumentAddress: string | null
} {
  const expectedAddress = propertyRow ? buildCanonicalExpectedAddress(propertyRow) : null
  const extractedDocumentAddress = extracted?.raw_line1?.trim() || null

  if (!propertyRow || !hasCoreTriple(propertyRow)) {
    return {
      status: "unknown",
      confidence: 0.25,
      reason:
        "Verification is not available because the property address is missing street, house number, or city.",
      expectedAddress,
      extractedDocumentAddress,
    }
  }

  if (
    extracted &&
    normalizeAddressCoreField(extracted.street_name) !== "" &&
    normalizeAddressCoreField(extracted.house_number) !== "" &&
    normalizeAddressCoreField(extracted.municipality) === ""
  ) {
    const streetOk = streetFieldsEquivalent(extracted.street_name, propertyRow.street_name)
    const houseOk = houseNumberFieldsEquivalent(extracted.house_number, propertyRow.house_number)

    if (streetOk && houseOk) {
      return {
        status: "possible_match",
        confidence: 0.68,
        reason:
          "The document states the same street and house number, but no municipality was found in the document.",
        expectedAddress,
        extractedDocumentAddress,
      }
    }
  }

  if (!extracted || !hasCoreTriple(extracted)) {
    return {
      status: "unknown",
      confidence: 0.2,
      reason: "The address could not be found in the document.",
      expectedAddress,
      extractedDocumentAddress,
    }
  }

  const streetOk = streetFieldsEquivalent(extracted.street_name, propertyRow.street_name)
  const houseOk = houseNumberFieldsEquivalent(extracted.house_number, propertyRow.house_number)
  const cityOk = municipalityFieldsEquivalent(extracted.municipality, propertyRow.municipality)

  if (streetOk && houseOk && cityOk) {
    return {
      status: "match",
      confidence: 0.95,
      reason: "Street, house number, and city match the property record.",
      expectedAddress,
      extractedDocumentAddress,
    }
  }

  return {
    status: "mismatch",
    confidence: 0.35,
    reason: "The address found in the document does not match the property street, house number, or city.",
    expectedAddress,
    extractedDocumentAddress,
  }
}
