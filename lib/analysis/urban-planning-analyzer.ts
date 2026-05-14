import "server-only"

import type { AnalysisResult, Flag } from "./detectors"
import { GEMINI_MODEL, generateContentWithRetry } from "@/lib/ai/gemini"
import { userFacingAnalysisFailureFromError } from "@/lib/ai/gemini-errors"
import {
  assertParseableJsonFromModelOutput,
  getTextFromGeminiResponse,
  parseJsonFromModelOutput,
} from "@/lib/ai/json-from-model"
import { structuredAddressFromSchemaFields } from "@/lib/property-address/extract-from-analysis"
import { extractUrbanPlanningMetadata } from "@/lib/property-metadata/urban-planning"

const PROMPT_VERSION = "1.0"

type UrbanPlanningAIResponse = {
  document_type?: string | null
  status?: "red" | "orange" | "green" | null
  summary?: string | null
  flags?: Flag[] | null
  permit_status?: string | null
  zoning?: string | null
  violations_or_enforcement?: string[] | null
  restrictions_or_actions?: string[] | null
  property_street?: string | null
  property_house_number?: string | null
  property_box?: string | null
  property_postal_code?: string | null
  property_municipality?: string | null
  property_region?: string | null
  construction_year?: number | null
  living_area_m2?: number | null
  dwelling_type?: "house" | "apartment" | "land" | "commercial" | "other" | null
}

const DWELLING_TYPE_VALUES = new Set<NonNullable<UrbanPlanningAIResponse["dwelling_type"]>>([
  "house",
  "apartment",
  "land",
  "commercial",
  "other",
])

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function coerceStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const out = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
  return out.length ? out : null
}

function coerceFlags(raw: unknown): Flag[] {
  if (!Array.isArray(raw)) return []
  const out: Flag[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const severity =
      row.severity === "red" || row.severity === "orange" || row.severity === "green"
        ? row.severity
        : "orange"
    const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Stedenbouwkundige bevinding"
    const details = typeof row.details === "string" ? row.details.trim() : ""
    out.push({ severity, title, details })
  }
  return out
}

function coerceArea(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < 100_000) return raw
  if (typeof raw === "string") {
    const compact = raw.replace(/\s+/g, "")
    const decimal =
      compact.includes(",") && compact.includes(".")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(",", ".")
    const n = Number(decimal)
    if (Number.isFinite(n) && n > 0 && n < 100_000) return n
  }
  return null
}

function coerceConstructionYear(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const rounded = Math.round(raw)
    return rounded >= 1700 && rounded <= 2100 ? rounded : null
  }
  if (typeof raw === "string") {
    const m = raw.match(/((?:17|18|19|20)\d{2})/)
    if (m) {
      const n = Number.parseInt(m[1], 10)
      if (n >= 1700 && n <= 2100) return n
    }
  }
  return null
}

function coerceDwellingType(raw: unknown): UrbanPlanningAIResponse["dwelling_type"] {
  if (typeof raw !== "string") return null
  const v = raw.trim().toLowerCase()
  return DWELLING_TYPE_VALUES.has(v as NonNullable<UrbanPlanningAIResponse["dwelling_type"]>)
    ? (v as NonNullable<UrbanPlanningAIResponse["dwelling_type"]>)
    : null
}

function coerceUrbanData(parsed: unknown): UrbanPlanningAIResponse {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  const o = parsed as Record<string, unknown>
  return {
    document_type: typeof o.document_type === "string" ? o.document_type : null,
    status: o.status === "red" || o.status === "orange" || o.status === "green" ? o.status : null,
    summary: typeof o.summary === "string" ? o.summary : null,
    flags: coerceFlags(o.flags),
    permit_status: typeof o.permit_status === "string" ? o.permit_status : null,
    zoning: typeof o.zoning === "string" ? o.zoning : null,
    violations_or_enforcement: coerceStringArray(o.violations_or_enforcement),
    restrictions_or_actions: coerceStringArray(o.restrictions_or_actions),
    property_street: typeof o.property_street === "string" ? o.property_street : null,
    property_house_number: typeof o.property_house_number === "string" ? o.property_house_number : null,
    property_box: typeof o.property_box === "string" ? o.property_box : null,
    property_postal_code: typeof o.property_postal_code === "string" ? o.property_postal_code : null,
    property_municipality: typeof o.property_municipality === "string" ? o.property_municipality : null,
    property_region: typeof o.property_region === "string" ? o.property_region : null,
    construction_year: coerceConstructionYear(o.construction_year),
    living_area_m2: coerceArea(o.living_area_m2),
    dwelling_type: coerceDwellingType(o.dwelling_type),
  }
}

function propertyAddressFromUrban(data: UrbanPlanningAIResponse): AnalysisResult["property_address"] {
  return structuredAddressFromSchemaFields({
    street: data.property_street,
    house_number: data.property_house_number,
    box: data.property_box,
    postal_code: data.property_postal_code,
    municipality: data.property_municipality,
    region: data.property_region,
  }) ?? undefined
}

function transformUrbanToAnalysisResult(data: UrbanPlanningAIResponse, text: string): AnalysisResult {
  const flags = data.flags ?? []
  const summaryParts: string[] = []
  const metadata = extractUrbanPlanningMetadata(text)

  if (data.permit_status) summaryParts.push(`Vergunningen: ${data.permit_status}`)
  if (data.zoning) summaryParts.push(`Bestemming: ${data.zoning}`)
  if (data.violations_or_enforcement?.length) {
    summaryParts.push(`Overtredingen/handhaving: ${data.violations_or_enforcement.join("; ")}`)
  }
  if (data.restrictions_or_actions?.length) {
    summaryParts.push(`Acties/beperkingen: ${data.restrictions_or_actions.join("; ")}`)
  }
  if (data.summary?.trim()) summaryParts.unshift(data.summary.trim())

  let status: "red" | "orange" | "green" = data.status ?? "green"
  const hasEnforcement = Boolean(data.violations_or_enforcement?.length)
  const hasRestrictions = Boolean(data.restrictions_or_actions?.length)
  if (hasEnforcement) {
    status = "red"
    if (!flags.some((f) => f.title.toLowerCase().includes("handhaving") || f.title.toLowerCase().includes("enforcement"))) {
      flags.push({
        severity: "red",
        title: "Handhaving of overtreding vermeld",
        details: "Het document vermeldt een overtreding, handhavingsitem of onopgelost vergunningsprobleem. Controleer dit voor het afsluiten van de transactie.",
      })
    }
  } else if (hasRestrictions && status === "green") {
    status = "orange"
    flags.push({
      severity: "orange",
      title: "Stedenbouwkundige beperking of opvolging",
      details: "Het document vermeldt beperkingen of opvolgacties die gecontroleerd moeten worden voor publicatie of verkoop.",
    })
  }

  if (!summaryParts.length && flags.length === 0) {
    summaryParts.push("Stedenbouwkundige inlichtingen geanalyseerd - geen duidelijke problemen gevonden.")
  }
  if (!summaryParts.length) {
    summaryParts.push("Stedenbouwkundige inlichtingen geanalyseerd - controleer de gemarkeerde bevindingen.")
  }

  const address = propertyAddressFromUrban(data)
  // Rule-based regex wins when it found a value (more deterministic on canonical wording),
  // Gemini fills any gap — most importantly `living_area_m2`, which earlier shipped as regex-only
  // and silently dropped out of the property's pandgegevens when the stedenbouwkundige document
  // phrased the habitable area in a format the regex didn't catch.
  const mergedMetadata: Partial<AnalysisResult> = { ...metadata }
  if (mergedMetadata.construction_year == null && data.construction_year != null) {
    mergedMetadata.construction_year = data.construction_year
  }
  if (mergedMetadata.living_area_m2 == null && data.living_area_m2 != null) {
    mergedMetadata.living_area_m2 = data.living_area_m2
  }
  if (mergedMetadata.dwelling_type == null && data.dwelling_type != null) {
    mergedMetadata.dwelling_type = data.dwelling_type
  }
  return {
    status,
    summary: summaryParts.join(" | "),
    flags,
    confidence: 0.82,
    ...mergedMetadata,
    ...(address ? { property_address: address } : {}),
  }
}

export type UrbanPlanningMetadataAIResult = {
  construction_year: number | null
  living_area_m2: number | null
  dwelling_type: NonNullable<UrbanPlanningAIResponse["dwelling_type"]> | null
}

/**
 * Focused Gemini call that asks only for the property-metadata fields the regex sometimes misses
 * (bewoonbare oppervlakte / bouwjaar / pandtype). Used at intake time so the pandgegevens get
 * populated without running the full analyzer pipeline. Returns nulls on any failure — caller
 * decides whether to fall back to regex-only values.
 */
export async function extractUrbanPlanningMetadataWithAI(
  text: string
): Promise<UrbanPlanningMetadataAIResult> {
  const empty: UrbanPlanningMetadataAIResult = {
    construction_year: null,
    living_area_m2: null,
    dwelling_type: null,
  }
  const normalized = normalizeText(text)
  if (normalized.length < 40) return empty
  const textToSend = normalized.substring(0, 14000)
  const isTruncated = normalized.length > 14000

  try {
    const prompt = `You read a Belgian stedenbouwkundige inlichtingen / vastgoedinformatie / stedenbouwkundig uittreksel document and extract three property-level metadata fields. Return ONLY valid JSON, no prose.

{
  "construction_year": number | null,
  "living_area_m2": number | null,
  "dwelling_type": "house" | "apartment" | "land" | "commercial" | "other" | null
}

Rules:
- "living_area_m2": habitable / usable floor area of the property in square meters. Accept Dutch labels: "bewoonbare oppervlakte", "woonoppervlakte", "netto vloeroppervlakte", "bruto vloeroppervlakte", "bruikbare vloeroppervlakte", "nuttige vloeroppervlakte". DO NOT use perceeloppervlakte, kadastrale oppervlakte, terreinoppervlakte, tuin, grondoppervlakte, bebouwde oppervlakte. Just the number.
- "construction_year": bouwjaar / jaar van bouw / oprichtingsjaar (YYYY, 1700–2100).
- "dwelling_type": eengezinswoning/woonhuis/rijwoning/villa/bungalow/halfopen/gesloten/open bebouwing → "house"; appartement/flat/studio/duplex/meergezinswoning → "apartment"; bouwgrond/landbouwgrond/onbebouwd perceel → "land"; handelspand/kantoor/winkel/horeca/bedrijfspand/industrieel → "commercial"; otherwise "other" or null.
- Return null for any field the document does not state.

Document text:
${textToSend}${isTruncated ? "\n\n[Document truncated for length]" : ""}`

    const response = await generateContentWithRetry(
      { model: GEMINI_MODEL, contents: prompt },
      { validateText: assertParseableJsonFromModelOutput }
    )
    const content = getTextFromGeminiResponse(response)
    if (!content) return empty
    const parsed = parseJsonFromModelOutput(content)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty
    const o = parsed as Record<string, unknown>
    return {
      construction_year: coerceConstructionYear(o.construction_year),
      living_area_m2: coerceArea(o.living_area_m2),
      dwelling_type: coerceDwellingType(o.dwelling_type) ?? null,
    }
  } catch (error) {
    console.warn("[urban-planning] focused metadata Gemini call failed", error)
    return empty
  }
}

export async function analyzeUrbanPlanningWithAI(
  text: string
): Promise<{ result: AnalysisResult; modelName: string; promptVersion: string }> {
  let modelName = GEMINI_MODEL
  const normalizedText = normalizeText(text)
  const textToSend = normalizedText.substring(0, 16000)
  const isTruncated = normalizedText.length > 16000

  try {
    const prompt = `You analyze Belgian urban-planning information documents for real estate managers.
Documents may be called stedenbouwkundige inlichtingen, stedenbouwkundig attest, vastgoedinformatie, stedenbouwkundig uittreksel, or omgevingsinformatie.

Return ONLY valid JSON with:
{
  "document_type": "urban_planning_info",
  "status": "red" | "orange" | "green",
  "summary": "short practical Dutch summary",
  "flags": [{"severity":"red|orange|green","title":"...","details":"..."}],
  "permit_status": string | null,
  "zoning": string | null,
  "violations_or_enforcement": string[] | null,
  "restrictions_or_actions": string[] | null,
  "property_street": string | null,
  "property_house_number": string | null,
  "property_box": string | null,
  "property_postal_code": string | null,
  "property_municipality": string | null,
  "property_region": string | null,
  "construction_year": number | null,
  "living_area_m2": number | null,
  "dwelling_type": "house" | "apartment" | "land" | "commercial" | "other" | null
}

Property metadata guidance:
- "living_area_m2" must be the property's habitable / usable floor area in square meters. Accept Dutch labels such as "bewoonbare oppervlakte", "woonoppervlakte", "netto vloeroppervlakte", "bruto vloeroppervlakte", "bruikbare vloeroppervlakte", "nuttige vloeroppervlakte". NEVER use perceeloppervlakte, kadastrale oppervlakte, terreinoppervlakte, tuin, or grondoppervlakte. Return only the number, no unit.
- "construction_year" is bouwjaar / jaar van bouw / oprichtingsjaar (YYYY between 1700 and 2100).
- "dwelling_type": map "eengezinswoning/woonhuis/rijwoning/villa/bungalow/halfopen/gesloten/open bebouwing" → "house"; "appartement/flat/studio/duplex/meergezinswoning" → "apartment"; "bouwgrond/landbouwgrond/onbebouwd perceel" → "land"; "handelspand/kantoor/winkel/horeca/bedrijfspand/industrieel" → "commercial"; anything else → "other" or null.
- Set the field to null when the document does not state the value.

Severity guidance:
- red: building violation, enforcement, unresolved permit conflict, demolition order, or illegal construction signal.
- orange: important restriction, zoning limitation, missing/unclear permit detail, heritage/flood/future planning note, or action advisable.
- green: no explicit urban-planning issue or action is apparent.
Use Dutch for summary, flag titles, and flag details.
Only flag genuine findings from the text. If uncertain, use orange and explain what must be checked.

Document text:
${textToSend}${isTruncated ? "\n\n[Document truncated for length]" : ""}`

    const response = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents: prompt,
    }, {
      validateText: assertParseableJsonFromModelOutput,
    })
    modelName = `${response.provider}:${response.model}`
    const content = getTextFromGeminiResponse(response)
    if (!content) throw new Error("No content in urban-planning LLM response")
    const parsed = parseJsonFromModelOutput(content)
    const data = coerceUrbanData(parsed)
    return {
      result: transformUrbanToAnalysisResult(data, normalizedText),
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  } catch (error) {
    const ux = userFacingAnalysisFailureFromError(error)
    const metadata = extractUrbanPlanningMetadata(normalizedText)
    return {
      result: {
        status: "orange",
        summary: ux.summary,
        flags: [{ severity: "orange", title: ux.title, details: ux.details }],
        ...metadata,
      },
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  }
}
