import "server-only"

type ExtractionResult = {
  text: string
  pages: Array<{ pageNumber: number; text: string; length: number }>
  totalLength: number
}

/** PDF extraction using pdf-parse (works in Node/Next.js server without worker setup). */
export async function extractTextFromPDF(buffer: Buffer): Promise<ExtractionResult> {
  const pdf = await import("pdf-parse")
  const parsedPdf = await pdf.default(buffer)

  const text = parsedPdf.text || ""
  return {
    text,
    pages: [{ pageNumber: 1, text, length: text.length }],
    totalLength: text.length,
  }
}

/** Alias kept for callers that reference the fallback name directly. */
export const extractTextFromPDFFallback = extractTextFromPDF

