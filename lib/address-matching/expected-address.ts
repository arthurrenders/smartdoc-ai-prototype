import type { PropertyAddressRecord } from "@/lib/property-address/types"

/**
 * Single string comparable to an extracted certificate address.
 * Prefers geocoder-normalized line, then structured fields, then raw_line1.
 */
export function buildCanonicalExpectedAddress(row: PropertyAddressRecord | null): string | null {
  if (!row) return null

  const norm = row.normalized_full_address?.trim()
  if (norm) return norm

  const streetLine = [row.street_name, row.house_number].filter(Boolean).join(" ").trim()
  const boxPart = row.box?.trim() ? `bus ${row.box.trim()}` : ""
  const cityLine = [row.postal_code, row.municipality].filter(Boolean).join(" ").trim()

  const parts = [streetLine, boxPart, cityLine].filter(Boolean)
  if (parts.length > 0) {
    return parts.join(", ")
  }

  const raw = row.raw_line1?.trim()
  return raw || null
}
