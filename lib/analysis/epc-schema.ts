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
  construction_year: z.number().int().nullable().optional(),
  heating_type: z
    .enum(["gas", "oil", "electric", "heat_pump", "district", "other"])
    .nullable()
    .optional(),
  dwelling_type: z
    .enum(["house", "apartment", "land", "commercial", "other"])
    .nullable()
    .optional(),
  living_area_m2: z.number().nullable().optional(),
  bedrooms: z.number().int().nullable().optional(),
})

export type EPCResponse = z.infer<typeof EPCResponseSchema>

/**
 * EPC label derived from primary energy (kWh/m²/year) when the numeric value is trusted.
 * Bands: A+ [-100,0], A (0,100), B [100,200), C [200,300), D [300,400), E [400,500), F ≥500.
 * Values below -100 are not mapped (returns null).
 */
export function epcScoreLetterFromEnergyKwh(kwh: number): EPCResponse["epc_score_letter"] | null {
  if (!Number.isFinite(kwh)) return null
  if (kwh < -100) return null
  if (kwh <= 0) return "A+"
  if (kwh >= 500) return "F"
  if (kwh >= 400) return "E"
  if (kwh >= 300) return "D"
  if (kwh >= 200) return "C"
  if (kwh >= 100) return "B"
  return "A"
}

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

function intOrNull(raw: unknown): number | null {
  const n = numberOrNull(raw)
  if (n === null) return null
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

const HEATING_ALIASES: Record<string, "gas" | "oil" | "electric" | "heat_pump" | "district" | "other"> = {
  gas: "gas",
  aardgas: "gas",
  natural_gas: "gas",
  natuurgas: "gas",
  oil: "oil",
  stookolie: "oil",
  mazout: "oil",
  fuel: "oil",
  fuel_oil: "oil",
  electric: "electric",
  elektrisch: "electric",
  electricity: "electric",
  electriciteit: "electric",
  heat_pump: "heat_pump",
  warmtepomp: "heat_pump",
  heatpump: "heat_pump",
  district: "district",
  stadsverwarming: "district",
  district_heating: "district",
  pellet: "other",
  hout: "other",
  wood: "other",
  biomass: "other",
  other: "other",
  anders: "other",
}

function normalizeHeatingType(raw: unknown): EPCResponse["heating_type"] {
  if (raw === null || raw === undefined) return null
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_")
  if (key === "") return null
  if (key in HEATING_ALIASES) return HEATING_ALIASES[key]
  // Substring match for partials like "Hoofdverwarming: aardgas (HR)"
  for (const alias in HEATING_ALIASES) {
    if (key.includes(alias)) return HEATING_ALIASES[alias]
  }
  return null
}

const DWELLING_ALIASES: Record<string, "house" | "apartment" | "land" | "commercial" | "other"> = {
  house: "house",
  woning: "house",
  eengezinswoning: "house",
  detached: "house",
  semi_detached: "house",
  maison: "house",
  apartment: "apartment",
  appartement: "apartment",
  flat: "apartment",
  studio: "apartment",
  land: "land",
  grond: "land",
  perceel: "land",
  bouwgrond: "land",
  commercial: "commercial",
  commercieel: "commercial",
  handelspand: "commercial",
  winkel: "commercial",
  kantoor: "commercial",
  other: "other",
  anders: "other",
}

function normalizeDwellingType(raw: unknown): EPCResponse["dwelling_type"] {
  if (raw === null || raw === undefined) return null
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_")
  if (key === "") return null
  if (key in DWELLING_ALIASES) return DWELLING_ALIASES[key]
  for (const alias in DWELLING_ALIASES) {
    if (key.includes(alias)) return DWELLING_ALIASES[alias]
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
    construction_year: null,
    heating_type: null,
    dwelling_type: null,
    living_area_m2: null,
    bedrooms: null,
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
    construction_year: intOrNull(
      o.construction_year ?? o.bouwjaar ?? o.year_built ?? o.build_year ?? o.jaar_van_bouw,
    ),
    heating_type: normalizeHeatingType(
      o.heating_type ?? o.hoofdverwarming ?? o.warmte_opwekker ?? o.heating_system ?? o.verwarming,
    ),
    dwelling_type: normalizeDwellingType(
      o.dwelling_type ?? o.property_type ?? o.type_woning ?? o.gebouwtype ?? o.woning_type,
    ),
    living_area_m2: numberOrNull(
      o.living_area_m2 ?? o.bewoonbare_oppervlakte ?? o.beschermd_volume_m2 ?? o.useful_floor_area,
    ),
    bedrooms: intOrNull(
      o.bedrooms ?? o.aantal_slaapkamers ?? o.slaapkamers ?? o.number_of_bedrooms,
    ),
  }

  const validated = EPCResponseSchema.safeParse(withDocType)
  if (!validated.success) {
    console.error("EPC normalize failed Zod after coercion:", validated.error.flatten())
    return empty
  }
  return validated.data
}

