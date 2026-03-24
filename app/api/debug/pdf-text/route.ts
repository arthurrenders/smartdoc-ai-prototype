import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import {
  extractTextFromPDF,
  extractTextFromPDFFallback,
} from "@/lib/pdf/extractor"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const documentId = formData.get("documentId") as string

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Fetch document
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("storage_path, document_types(name)")
      .eq("id", documentId)
      .single()

    if (documentError || !document) {
      return NextResponse.json(
        { error: `Failed to fetch document: ${documentError?.message}` },
        { status: 404 }
      )
    }

    // Download PDF from Supabase Storage
    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path)

    if (downloadError || !pdfBlob) {
      return NextResponse.json(
        { error: `Failed to download PDF: ${downloadError?.message}` },
        { status: 500 }
      )
    }

    // Convert Blob to Buffer
    const arrayBuffer = await pdfBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text from PDF
    let extractionInfo: {
      text: string
      pages: Array<{ pageNumber: number; text: string; length: number }>
      totalLength: number
    }

    try {
      // Try pdfjs-dist first
      try {
        extractionInfo = await extractTextFromPDF(buffer)
      } catch (pdfjsError) {
        // Fallback to pdf-parse
        extractionInfo = await extractTextFromPDFFallback(buffer)
      }

      const docTypes = document.document_types as { name?: string } | { name?: string }[] | null | undefined
      const documentTypeName = Array.isArray(docTypes) ? docTypes[0]?.name : docTypes?.name

      return NextResponse.json({
        success: true,
        documentType: documentTypeName || "unknown",
        storagePath: document.storage_path,
        extraction: {
          totalLength: extractionInfo.totalLength,
          pages: extractionInfo.pages.map((page) => ({
            pageNumber: page.pageNumber,
            length: page.length,
            preview: page.text.substring(0, 500),
            fullText: page.text,
          })),
          fullText: extractionInfo.text,
        },
      })
    } catch (parseError) {
      return NextResponse.json(
        {
          error: `Failed to extract text: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    )
  }
}



