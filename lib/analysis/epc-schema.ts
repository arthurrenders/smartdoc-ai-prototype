import { z } from "zod"

// Schema for EPC-specific AI response
export const EPCResponseSchema = z.object({
  document_type: z.literal("epc").optional(),
  epc_score_letter: z.enum(["A+", "A", "B", "C", "D", "E", "F"]).nullable(),
  energy_consumption_kwh_m2_year: z.number().nullable(),
  certificate_date: z.string().nullable(),
  expiry_date: z.string().nullable(),
  is_expired: z.boolean().nullable(),
  red_flags: z.array(z.string()).optional().default([]),
  property_street: z.string().nullable().optional(),
  property_house_number: z.string().nullable().optional(),
  property_box: z.string().nullable().optional(),
  property_postal_code: z.string().nullable().optional(),
  property_municipality: z.string().nullable().optional(),
  property_region: z.string().nullable().optional(),
})

export type EPCResponse = z.infer<typeof EPCResponseSchema>

const EPC_SCORE_LETTERS = new Set<EPCResponse["epc_score_letter"]>([
  "A+",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
])

function normalizeEpcScoreLetter(raw: unknown): EPCResponse["epc_score_letter"] {
  if (raw === null || raw === undefined) return null
  const compact = String(raw).trim().replace(/\s+/g, "").toUpperCase()
  if (compact === "A+" || compact === "A＋") return "A+"
  if (compact.length === 1 && "ABCDEF".includes(compact)) {
    return compact as EPCResponse["epc_score_letter"]
  }
  if (EPC_SCORE_LETTERS.has(compact as EPCResponse["epc_score_letter"])) {
    return compact as EPCResponse["epc_score_letter"]
  }
  return null
}

function numberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/\s/g, "").replace(",", "."))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function stringOrNull(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  return s === "" ? null : s
}

function booleanOrNull(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "boolean") return raw
  if (typeof raw === "number") return raw !== 0
  if (typeof raw === "string") {
    const l = raw.trim().toLowerCase()
    if (l === "true" || l === "yes" || l === "1" || l === "ja") return true
    if (l === "false" || l === "no" || l === "0" || l === "nee") return false
  }
  return null
}

function normalizeStringArray(raw: unknown): string[] {
  if (raw === null || raw === undefined) return []
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === "string") {
      const t = item.trim()
      if (t) out.push(t)
      continue
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>
      const code = o.code ?? o.flag ?? o.type ?? o.name ?? o.id
      if (typeof code === "string" && code.trim()) {
        out.push(code.trim())
        continue
      }
      if (typeof o.message === "string" && o.message.trim()) {
        out.push(o.message.trim())
      }
    }
  }
  return out
}

/**
 * Coerce loosely-typed LLM JSON into {@link EPCResponse} without failing on
 * string numbers, casing, or oddly-shaped red_flags entries.
 */
export function normalizeParsedEpcResponse(parsed: unknown): EPCResponse {
  const empty: EPCResponse = {
    epc_score_letter: null,
    energy_consumption_kwh_m2_year: null,
    certificate_date: null,
    expiry_date: null,
    is_expired: null,
    red_flags: [],
    property_street: null,
    property_house_number: null,
    property_box: null,
    property_postal_code: null,
    property_municipality: null,
    property_region: null,
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return empty
  }

  const o = parsed as Record<string, unknown>

  const letter =
    o.epc_score_letter ?? o.epc_class ?? o.energy_label ?? o.label_class ?? o.epc_label
  const energy =
    o.energy_consumption_kwh_m2_year ??
    o.energy_consumption ??
    o.primary_energy_kwh_m2_year ??
    o.kwh_m2_year ??
    o.epc_kengetal

  const docType = o.document_type
  const withDocType: EPCResponse = {
    ...empty,
    ...(docType === "epc" ? { document_type: "epc" } : {}),
    epc_score_letter: normalizeEpcScoreLetter(letter),
    energy_consumption_kwh_m2_year: numberOrNull(energy),
    certificate_date: stringOrNull(
      o.certificate_date ?? o.issue_date ?? o.datum_certificaat ?? o.certificaat_datum
    ),
    expiry_date: stringOrNull(
      o.expiry_date ?? o.expiration_date ?? o.vervaldatum ?? o.verval_datum
    ),
    is_expired: booleanOrNull(o.is_expired ?? o.expired),
    red_flags: normalizeStringArray(o.red_flags ?? o.redFlags),
    property_street: stringOrNull(o.property_street),
    property_house_number: stringOrNull(o.property_house_number),
    property_box: stringOrNull(o.property_box),
    property_postal_code: stringOrNull(o.property_postal_code),
    property_municipality: stringOrNull(o.property_municipality),
    property_region: stringOrNull(o.property_region),
  }

  const validated = EPCResponseSchema.safeParse(withDocType)
  if (!validated.success) {
    console.error("EPC normalize failed Zod after coercion:", validated.error.flatten())
    return empty
  }
  return validated.data
}

