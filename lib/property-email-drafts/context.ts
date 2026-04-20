import type { PropertyDetailData } from "@/app/actions/get-property-detail"

function formatAddress(data: PropertyDetailData): string {
  const a = data.propertyAddress
  if (!a) return "Address: not on file."
  const line =
    a.normalized_full_address ||
    [a.raw_line1, [a.postal_code, a.municipality].filter(Boolean).join(" ")].filter(Boolean).join(", ")
  return `Address: ${line || "not on file"}`
}

/**
 * Compact, factual context for the model — only fields from property detail.
 */
export function formatPropertyFactsForEmailDraft(data: PropertyDetailData): string {
  const lines: string[] = []
  lines.push(`Property name: ${data.propertyDisplayName}`)
  lines.push(`Property record id: ${data.propertyId}`)
  lines.push(formatAddress(data))
  lines.push(`Overall compliance status (app): ${data.stats.status}`)
  lines.push(
    `Counts: required types ${data.summaryCounts.requiredTotal}, valid (green) ${data.summaryCounts.validCount}, missing ${data.summaryCounts.missingCount}, manual-review types ${data.summaryCounts.manualReviewCount}.`
  )
  lines.push(`Summary: ${data.summaryCounts.summaryParagraph}`)
  if (data.missingRequiredDocumentNames.length) {
    lines.push(`Missing required document types: ${data.missingRequiredDocumentNames.join(", ")}`)
  } else {
    lines.push("Missing required document types: none")
  }
  if (data.presentDocumentsBrief.length) {
    lines.push("Current uploads (latest per type, from analysis):")
    for (const row of data.presentDocumentsBrief) {
      const bits = [row.documentTypeName]
      if (row.analysisStatus) bits.push(`status=${row.analysisStatus}`)
      if (row.analysisSummary) bits.push(`summary="${row.analysisSummary.replace(/\s+/g, " ").trim()}"`)
      lines.push(`- ${bits.join(" | ")}`)
    }
  } else {
    lines.push("Current uploads: none recorded.")
  }
  if (data.flags.length) {
    lines.push("Flags from latest document analyses:")
    for (const f of data.flags) {
      const doc = f.documentTypeName ? ` [${f.documentTypeName}]` : ""
      const n = f.occurrenceCount && f.occurrenceCount > 1 ? ` (x${f.occurrenceCount})` : ""
      lines.push(`- [${f.severity}]${doc}${n} ${f.title}: ${f.details}`)
    }
  } else {
    lines.push("Flags: none recorded.")
  }
  lines.push(`Suggested primary action: ${data.suggestedActions.primary}`)
  if (data.suggestedActions.followUps.length) {
    lines.push("Suggested follow-ups:")
    data.suggestedActions.followUps.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`))
  }
  const exec = data.executiveSummary.replace(/\s+/g, " ").trim()
  lines.push(`Executive summary (from analyses, may be long): ${exec.slice(0, 2500)}${exec.length > 2500 ? "…" : ""}`)
  return lines.join("\n")
}
