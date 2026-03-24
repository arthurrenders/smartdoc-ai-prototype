import type { AnalysisResult } from "@/lib/analysis/detectors"
import { normalizeToIsoDate } from "./normalize-date"

export type ExtractedDocumentDate = {
  date_type: string
  date_on: string
  source: "structured" | "summary_parse"
}

type AddFn = (dateType: string, raw: string | null | undefined, source: ExtractedDocumentDate["source"]) => void

const SUMMARY_LINE_PATTERNS: Array<{ date_type: string; re: RegExp }> = [
  { date_type: "inspection", re: /inspection date:\s*([^\n|]+)/i },
  { date_type: "certificate", re: /certificate date:\s*([^\n|]+)/i },
  { date_type: "expiry", re: /expiry date:\s*([^\n|]+)/i },
]

function parseSummaryForDates(summary: string, add: AddFn): void {
  if (!summary?.trim()) return
  for (const { date_type, re } of SUMMARY_LINE_PATTERNS) {
    const match = summary.match(re)
    if (match?.[1]) add(date_type, match[1].trim(), "summary_parse")
  }
}

/**
 * Collect significant dates from a completed analysis result.
 * Dedupes by date_type + date_on (structured attempts first via call order).
 */
export function extractDocumentDatesFromResult(
  documentTypeName: string | null,
  result: AnalysisResult
): ExtractedDocumentDate[] {
  const seen = new Set<string>()
  const out: ExtractedDocumentDate[] = []

  const add: AddFn = (dateType, raw, source) => {
    if (!raw) return
    const date_on = normalizeToIsoDate(raw)
    if (!date_on) return
    const key = `${dateType}|${date_on}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ date_type: dateType, date_on, source })
  }

  const t = documentTypeName?.toUpperCase() ?? ""

  if (t === "EPC") {
    add("certificate", result.certificate_date ?? undefined, "structured")
    add("expiry", result.expiry_date ?? undefined, "structured")
  }

  parseSummaryForDates(result.summary, add)

  return out
}
