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

const PROMPT_VERSION = "1.0"

type SoilCertificateAIResponse = {
  document_type?: string | null
  status?: "red" | "orange" | "green" | null
  summary?: string | null
  flags?: Flag[] | null
  certificate_number?: string | null
  certificate_date?: string | null
  conclusion?: string | null
  contamination_found?: boolean | null
  remediation_required?: boolean | null
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

function boolish(v: unknown): boolean | null {
  if (typeof v === "boolean") return v
  if (typeof v === "string") {
    const l = v.trim().toLowerCase()
    if (["true", "yes", "ja", "1"].includes(l)) return true
    if (["false", "no", "nee", "0"].includes(l)) return false
  }
  return null
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
    const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Bodemattestbevinding"
    const details = typeof row.details === "string" ? row.details.trim() : ""
    out.push({ severity, title, details })
  }
  return out
}

function coerceSoilData(parsed: unknown): SoilCertificateAIResponse {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  const o = parsed as Record<string, unknown>
  const restrictions = Array.isArray(o.restrictions_or_actions)
    ? o.restrictions_or_actions.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : null
  return {
    document_type: typeof o.document_type === "string" ? o.document_type : null,
    status: o.status === "red" || o.status === "orange" || o.status === "green" ? o.status : null,
    summary: typeof o.summary === "string" ? o.summary : null,
    flags: coerceFlags(o.flags),
    certificate_number: typeof o.certificate_number === "string" ? o.certificate_number : null,
    certificate_date: typeof o.certificate_date === "string" ? o.certificate_date : null,
    conclusion: typeof o.conclusion === "string" ? o.conclusion : null,
    contamination_found: boolish(o.contamination_found),
    remediation_required: boolish(o.remediation_required),
    restrictions_or_actions: restrictions,
    property_street: typeof o.property_street === "string" ? o.property_street : null,
    property_house_number: typeof o.property_house_number === "string" ? o.property_house_number : null,
    property_box: typeof o.property_box === "string" ? o.property_box : null,
    property_postal_code: typeof o.property_postal_code === "string" ? o.property_postal_code : null,
    property_municipality: typeof o.property_municipality === "string" ? o.property_municipality : null,
    property_region: typeof o.property_region === "string" ? o.property_region : null,
  }
}

function propertyAddressFromSoil(data: SoilCertificateAIResponse): AnalysisResult["property_address"] {
  return structuredAddressFromSchemaFields({
    street: data.property_street,
    house_number: data.property_house_number,
    box: data.property_box,
    postal_code: data.property_postal_code,
    municipality: data.property_municipality,
    region: data.property_region,
  }) ?? undefined
}

function normalizeForSoilRules(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isBenignSoilRegisterEntry(text: string): boolean {
  const t = normalizeForSoilRules(text)
  const hasNoIndications =
    /geen aanwijzingen.{0,180}(bodemverontreiniging|risicogrond)/.test(t) ||
    /geen aanwijzingen voor bodemverontreiniging/.test(t)
  const noRemediationCue =
    !/\b(saneringsplicht|sanering verplicht|bodemsanering verplicht|bodemsaneringsproject|beschrijvend bodemonderzoek verplicht|gebruiksbeperking|voorzorgsmaatregel|veiligheidsmaatregel|verontreiniging vastgesteld)\b/.test(t)
  return hasNoIndications && noRemediationCue
}

function isBenignSoilRegisterFlag(flag: Flag): boolean {
  const text = `${flag.title} ${flag.details}`.toLowerCase()
  return (
    text.includes("grondeninformatieregister") ||
    text.includes("grondinformatieregister") ||
    text.includes("register") ||
    text.includes("bodemverontreinig") ||
    text.includes("contamination") ||
    text.includes("risicogrond") ||
    text.includes("risk")
  )
}

function transformSoilToAnalysisResult(data: SoilCertificateAIResponse, text: string): AnalysisResult {
  const flags = data.flags ?? []
  const summaryParts: string[] = []
  const benignRegisterEntry = isBenignSoilRegisterEntry(text)

  if (benignRegisterEntry) {
    data.contamination_found = false
    data.remediation_required = false
    data.restrictions_or_actions = null
    for (let i = flags.length - 1; i >= 0; i--) {
      if (isBenignSoilRegisterFlag(flags[i])) flags.splice(i, 1)
    }
  }

  if (data.certificate_number) summaryParts.push(`Bodemattest: ${data.certificate_number}`)
  if (data.certificate_date) summaryParts.push(`Datum: ${data.certificate_date}`)
  if (data.conclusion) summaryParts.push(`Conclusie: ${data.conclusion}`)
  if (data.restrictions_or_actions?.length) {
    summaryParts.push(`Acties/beperkingen: ${data.restrictions_or_actions.join("; ")}`)
  }

  let status: "red" | "orange" | "green" = data.status ?? "green"
  if (data.remediation_required === true) {
    status = "red"
    if (!flags.some((f) => {
      const title = f.title.toLowerCase()
      return title.includes("remediation") || title.includes("sanering")
    })) {
      flags.push({
        severity: "red",
        title: "Bodemsanering vereist",
        details: "Het bodemattest vermeldt een sanerings- of opruimingsplicht. Volg dit op voor het afsluiten van de transactie.",
      })
    }
  } else if (data.contamination_found === true && status === "green") {
    status = "orange"
    flags.push({
      severity: "orange",
      title: "Bodemverontreiniging vermeld",
      details: "Het attest vermeldt bodemverontreiniging of een relevante registervermelding. Controleer de details voor het afsluiten.",
    })
  }

  if (benignRegisterEntry && flags.length === 0) {
    status = "green"
    summaryParts.push(
      "Opname in het grondeninformatieregister zonder aanwijzingen voor bodemverontreiniging of risicogrond."
    )
  }

  if (!summaryParts.length && flags.length === 0) {
    summaryParts.push("Bodemattest geanalyseerd - geen duidelijke problemen gevonden.")
  }
  if (!summaryParts.length) {
    summaryParts.push("Bodemattest geanalyseerd - controleer de gemarkeerde bevindingen.")
  }

  const address = propertyAddressFromSoil(data)
  return {
    status,
    summary: summaryParts.join(" | "),
    flags,
    confidence: 0.82,
    certificate_date: data.certificate_date ?? null,
    ...(address ? { property_address: address } : {}),
  }
}

export async function analyzeSoilCertificateWithAI(
  text: string
): Promise<{ result: AnalysisResult; modelName: string; promptVersion: string }> {
  let modelName = GEMINI_MODEL
  const normalizedText = normalizeText(text)
  const textToSend = normalizedText.substring(0, 14000)
  const isTruncated = normalizedText.length > 14000

  try {
    const prompt = `You analyze Belgian soil certificates (bodemattest / OVAM) for real estate managers.

Return ONLY valid JSON with:
{
  "document_type": "soil_certificate",
  "status": "red" | "orange" | "green",
  "summary": "short practical Dutch summary",
  "flags": [{"severity":"red|orange|green","title":"...","details":"..."}],
  "certificate_number": string | null,
  "certificate_date": "YYYY-MM-DD" | null,
  "conclusion": string | null,
  "contamination_found": boolean | null,
  "remediation_required": boolean | null,
  "restrictions_or_actions": string[] | null,
  "property_street": string | null,
  "property_house_number": string | null,
  "property_box": string | null,
  "property_postal_code": string | null,
  "property_municipality": string | null,
  "property_region": string | null
}

Severity guidance:
- red: remediation, clean-up, legal restriction, or explicit blocking action is required.
- orange: contamination, register entry, unclear conclusion, missing key fields, or follow-up is advisable.
- green: no soil risk or action is apparent from the certificate.
Important: if the text says the ground is included in the grondeninformatieregister but OVAM has no indications of soil contamination and no indication that it is a risicogrond, this is green and must not be flagged.
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
    if (!content) throw new Error("No content in soil certificate LLM response")
    const parsed = parseJsonFromModelOutput(content)
    const data = coerceSoilData(parsed)
    return {
      result: transformSoilToAnalysisResult(data, normalizedText),
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  } catch (error) {
    const ux = userFacingAnalysisFailureFromError(error)
    return {
      result: {
        status: "orange",
        summary: ux.summary,
        flags: [{ severity: "orange", title: ux.title, details: ux.details }],
      },
      modelName,
      promptVersion: PROMPT_VERSION,
    }
  }
}
