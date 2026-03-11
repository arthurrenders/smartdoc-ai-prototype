import "server-only"

/**
 * PDF text extraction. In Node.js (Next.js server), pdfjs-dist requires a worker URL
 * that cannot be satisfied in the bundle ("No GlobalWorkerOptions.workerSrc specified"),
 * so we use pdf-parse directly. Same return shape for callers.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<{
  text: string
  pages: Array<{ pageNumber: number; text: string; length: number }>
  totalLength: number
}> {
  return extractTextFromPDFFallback(buffer)
}

/**
 * PDF extraction using pdf-parse (works in Node/Next.js server without worker setup).
 * Also used as fallback from run-analysis if extractTextFromPDF throws.
 */
export async function extractTextFromPDFFallback(buffer: Buffer): Promise<{
  text: string
  pages: Array<{ pageNumber: number; text: string; length: number }>
  totalLength: number
}> {
  const pdf = await import("pdf-parse")
  const parsedPdf = await pdf.default(buffer)

  const text = parsedPdf.text || ""
  const pages: Array<{ pageNumber: number; text: string; length: number }> = []

  // pdf-parse doesn't provide per-page text, so we'll just return the full text
  pages.push({
    pageNumber: 1,
    text: text,
    length: text.length,
  })

  console.log(`PDF text extracted: ${text.length} characters`)
  if (text.length > 0) {
    console.log(`Preview (first 500 chars):`, text.substring(0, 500))
  }

  return {
    text,
    pages,
    totalLength: text.length,
  }
}

