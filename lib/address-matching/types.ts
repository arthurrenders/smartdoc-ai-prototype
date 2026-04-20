import type { ExtractedPropertyAddress } from "@/lib/property-address/types"

export type AddressMatchStatus = "match" | "possible_match" | "mismatch" | "unknown"

export type AddressMatchOutcome = {
  status: AddressMatchStatus
  /** Combined extraction + comparison confidence, 0–1 */
  confidence: number
  reason: string
  expectedAddress: string | null
  extractedDocumentAddress: string | null
  extracted: ExtractedPropertyAddress | null
}
