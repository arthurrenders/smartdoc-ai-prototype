import "server-only"

/**
 * Improved PDF text extraction using pdfjs-dist (legacy build)
 * Extracts text per page for better reliability
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<{
  text: string
  pages: Array<{ pageNumber: number; text: string; length: number }>
  totalLength: number
}> {
  const pages: Array<{ pageNumber: number; text: string; length: number }> = []
  let fullText = ""

  try {
    // Dynamic import for pdfjs-dist legacy build (ESM)
    const pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const pdfjs = (pdfjsModule as any).default || (pdfjsModule as any)

    // Disable worker in Node.js to avoid ESM/URL loader issues and remote HTTPS workers
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = null
    }

    // Load the PDF document
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      verbosity: 0, // Reduce console output
    })

    const pdfDocument = await loadingTask.promise
    const numPages = pdfDocument.numPages

    console.log(`PDF has ${numPages} pages`)

    // Extract text from each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum)
      const textContent = await page.getTextContent()

      // Combine all text items from the page
      let pageText = ""
      for (const item of textContent.items) {
        if ("str" in item && typeof item.str === "string") {
          pageText += item.str + " "
        }
      }

      // Clean up the text
      pageText = pageText.trim().replace(/\s+/g, " ")

      pages.push({
        pageNumber: pageNum,
        text: pageText,
        length: pageText.length,
      })

      fullText += pageText + "\n\n"

      console.log(`Page ${pageNum}: ${pageText.length} characters`)
      if (pageText.length > 0) {
        console.log(`Page ${pageNum} text (first 200 chars):`, pageText.substring(0, 200))
      } else {
        console.log(`Page ${pageNum}: WARNING - No text extracted!`)
      }
    }

    fullText = fullText.trim()

    console.log(`Total extracted text length: ${fullText.length}`)
    if (fullText.length > 0) {
      console.log(`Full extracted text (first 1000 chars):`, fullText.substring(0, 1000))
    } else {
      console.log("WARNING: No text extracted from PDF!")
    }

    return {
      text: fullText,
      pages,
      totalLength: fullText.length,
    }
  } catch (error) {
    console.error("PDF extraction error:", error)
    throw new Error(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

/**
 * Fallback PDF extraction using pdf-parse
 * Used if pdfjs-dist fails
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

  console.log(`Fallback extraction: ${text.length} characters`)
  console.log(`Fallback text (first 1000 chars):`, text.substring(0, 1000))

  return {
    text,
    pages,
    totalLength: text.length,
  }
}

