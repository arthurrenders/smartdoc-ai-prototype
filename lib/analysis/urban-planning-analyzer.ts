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
}

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
  return {
    status,
    summary: summaryParts.join(" | "),
    flags,
    confidence: 0.82,
    ...metadata,
    ...(address ? { property_address: address } : {}),
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
  "property_region": string | null
}

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
