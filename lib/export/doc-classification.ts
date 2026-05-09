/**
 * Routes a document type into the appropriate ZIP folder.
 * Public = visible in a portal listing; Private = legal/technical only.
 */
export type DocumentBucket = "public" | "private" | "photo"

const PUBLIC_TYPES = new Set(["EPC", "FLOOR_PLAN"])
const PRIVATE_TYPES = new Set([
  "ELECTRICAL",
  "ASBESTOS",
  "SOIL_CERTIFICATE",
  "CADASTRAL_EXTRACT",
  "URBAN_PLANNING_INFO",
  "OIL_TANK_CERTIFICATE",
])

export function classifyDocument(typeName: string | null): DocumentBucket {
  if (!typeName) return "private"
  const upper = typeName.toUpperCase()
  if (upper === "PHOTO") return "photo"
  if (PUBLIC_TYPES.has(upper)) return "public"
  if (PRIVATE_TYPES.has(upper)) return "private"
  return "private"
}

const FRIENDLY_FILENAME: Record<string, string> = {
  EPC: "EPC_certificate.pdf",
  ASBESTOS: "asbestos_certificate.pdf",
  ELECTRICAL: "electrical_inspection.pdf",
  SOIL_CERTIFICATE: "soil_certificate.pdf",
  CADASTRAL_EXTRACT: "cadastral_extract.pdf",
  URBAN_PLANNING_INFO: "urban_planning_info.pdf",
  OIL_TANK_CERTIFICATE: "oil_tank_certificate.pdf",
  FLOOR_PLAN: "floor_plan.pdf",
}

export function friendlyFilename(typeName: string | null, originalPath: string, fallbackIndex = 0): string {
  if (typeName) {
    const friendly = FRIENDLY_FILENAME[typeName.toUpperCase()]
    if (friendly) return friendly
  }
  // Use the basename of the storage path, otherwise a sequence number.
  const base = originalPath.split("/").pop() || `document_${fallbackIndex + 1}.pdf`
  return base
}
