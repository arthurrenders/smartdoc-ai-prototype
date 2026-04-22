import type { AddressMatchStatus } from "./types"

/** Serializable address check returned to the client after upload or when upload is blocked. */
export type DocumentAddressValidationPayload = {
  expected_property_id: string
  expected_address: string | null
  extracted_document_address: string | null
  address_match_status: AddressMatchStatus
  address_match_confidence: number
  address_match_reason: string
  address_match_user_overridden: boolean
}
