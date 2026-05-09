export type DestinationOutputFormat = "json" | "csv" | "xml" | "full_bundle"
export type DestinationType = "portal" | "crm" | "legal"

export type ConditionalRule = {
  if:
    | { always: true }
    | Record<string, { eq?: unknown; lt?: number; lte?: number; gt?: number; gte?: number; in?: unknown[] }>
  then: {
    required_documents?: string[]
    /** Documents that should be present but cannot be auto-verified.
     *  Missing → warning, not blocker. */
    manual_documents?: string[]
    required_fields?: string[]
  }
  reason?: string
}

export type ValidationRules = {
  required_fields?: string[]
  required_documents?: string[]
  global_required_documents?: string[]
  /** Top-level soft-required docs (warning when missing). */
  manual_required_documents?: string[]
  conditional?: ConditionalRule[]
}

export type FieldMapping = {
  category?: Record<string, string>
  transaction?: Record<string, string>
  csv_columns?: string[]
  [k: string]: unknown
}

export type Destination = {
  id: string
  slug: string
  name: string
  type: DestinationType
  output_format: DestinationOutputFormat
  validation_rules: ValidationRules
  field_mapping: FieldMapping
  enabled: boolean
}

export type ReadinessSeverity = "blocker" | "warning" | "ok"

export type ReadinessItem = {
  key: string
  label: string
  severity: ReadinessSeverity
  reason?: string
  /** When true, this item is a doc SmartDoc cannot auto-verify yet — UI shows a "Handmatig" badge. */
  manual?: boolean
}

export type ReadinessResult = {
  score: number
  items: ReadinessItem[]
  canExport: boolean
}

export type PropertyMetadata = {
  id: string
  display_name: string | null
  construction_year: number | null
  transaction_type: "sale" | "rent" | null
  heating_type: "gas" | "oil" | "electric" | "heat_pump" | "district" | "other" | null
  property_type: "house" | "apartment" | "land" | "commercial" | "other" | null
  asking_price: number | null
  bedrooms: number | null
  living_area_m2: number | null
  description: string | null
}

export type PropertyAddress = {
  street_name: string | null
  house_number: string | null
  box: string | null
  postal_code: string | null
  municipality: string | null
  region: string | null
  country_code: string | null
  normalized_full_address: string | null
  raw_line1: string | null
  latitude: number | null
  longitude: number | null
}

export type DocumentForExport = {
  id: string
  document_type_name: string | null
  storage_path: string
  status: string
  analysis_result: Record<string, unknown> | null
}

export type PropertyExportContext = {
  property: PropertyMetadata
  address: PropertyAddress | null
  documents: DocumentForExport[]
}
