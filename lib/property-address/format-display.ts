import type { PropertyAddressRecord } from "./types"

/**
 * Human-readable lines for UI: prefer structured BE fields, fall back to raw_line1.
 */
export function formatPropertyAddressLines(addr: PropertyAddressRecord): string[] {
  const parts: string[] = []
  const streetBits = [addr.street_name, addr.house_number, addr.box]
    .filter(Boolean)
    .join(" ")
    .trim()
  if (streetBits) {
    parts.push(streetBits)
  }
  const cityLine = [addr.postal_code, addr.municipality].filter(Boolean).join(" ").trim()
  if (cityLine) {
    parts.push(cityLine)
  }
  if (addr.region) {
    parts.push(addr.region)
  }
  if (addr.country_code && addr.country_code !== "BE") {
    parts.push(addr.country_code)
  }
  if (parts.length === 0 && addr.raw_line1?.trim()) {
    return [addr.raw_line1.trim()]
  }
  if (parts.length === 0) {
    return []
  }
  return parts
}
