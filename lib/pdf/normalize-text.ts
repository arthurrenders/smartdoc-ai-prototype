import "server-only"

/**
 * Normalise text from pdf-parse / PDF.js: line endings, unicode spaces, soft hyphens,
 * and noisy whitespace so address heuristics see stable tokens.
 */
export function normalizePdfTextForAddressExtraction(raw: string): string {
  if (!raw) return ""

  let t = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  t = t.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
  t = t.replace(/\u00AD/g, "")
  t = t.replace(/\n{3,}/g, "\n\n")

  t = t
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")

  return t.trim()
}

/**
 * Join broken lines so patterns can match "Street 12 3000 City" when the PDF split across lines.
 */
export function squashedSingleLineForAddressSearch(text: string): string {
  return normalizePdfTextForAddressExtraction(text).replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
}
