import type { ExtractedPropertyAddress, PropertyAddressRecord } from "@/lib/property-address/types"
import { buildCanonicalExpectedAddress } from "./expected-address"

/** Case-insensitive, trims whitespace, strips combining marks for stable comparison. */
export function normalizeAddressCoreField(s: string | null | undefined): string {
  if (!s) return ""
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
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

export type UploadAddressVerificationDbStatus = "match" | "mismatch" | "unknown"

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

  if (!extracted || !hasCoreTriple(extracted)) {
    return {
      status: "unknown",
      confidence: 0.2,
      reason: "The address could not be found in the document.",
      expectedAddress,
      extractedDocumentAddress,
    }
  }

  const streetOk =
    normalizeAddressCoreField(extracted.street_name) ===
    normalizeAddressCoreField(propertyRow.street_name)
  const houseOk =
    normalizeAddressCoreField(extracted.house_number) ===
    normalizeAddressCoreField(propertyRow.house_number)
  const cityOk =
    normalizeAddressCoreField(extracted.municipality) ===
    normalizeAddressCoreField(propertyRow.municipality)

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
