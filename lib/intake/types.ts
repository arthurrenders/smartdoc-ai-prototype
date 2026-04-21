export type IntakeProcessingStatus =
  | "uploaded"
  | "processing"
  | "processed"
  | "failed"
  | "needs_review"

export type IntakeDetectedDocumentType = "epc" | "electricity" | "asbestos" | "unknown"

export type IntakeUploadRow = {
  id: string
  user_id: string
  filename: string
  storage_path: string
  processing_status: IntakeProcessingStatus
  detected_document_type: IntakeDetectedDocumentType | null
  extracted_address_raw: string | null
  matched_property_id: string | null
  created_property_id: string | null
  confidence_score: number | null
  needs_manual_review: boolean
  error_message: string | null
  mime_type: string | null
  original_file_size: number | null
  created_at: string
}
