"use client"

import { useState, useRef, useEffect } from "react"
import { Upload, Play, FileQuestion, FileText } from "lucide-react"
import { uploadDocument } from "@/app/actions/upload-document"
import { getDocumentTypes, getDocumentsForProperty } from "@/app/actions/get-documents"
import { runAnalysis } from "@/app/actions/run-analysis"
import { pickGoogleDrivePdfFiles } from "@/lib/google-drive/picker-flow"

type DocumentType = {
  id: string
  name: string
}

type AnalysisResult = {
  status: string
  summary: string
  flags: Array<{
    severity: string
    title: string
    details: string
  }>
  epc_score_letter?: string | null
  energy_consumption_kwh_m2_year?: number | null
  certificate_date?: string | null
  expiry_date?: string | null
  is_expired?: boolean | null
}

type AnalysisRun = {
  id: string
  status: string
  result_json: AnalysisResult | null
}

type Document = {
  id: string
  property_id: string
  document_type_id: string | null
  storage_path: string
  status: string
  created_at: string
  document_types: DocumentType | null
  analysis_runs: AnalysisRun[] | null
}

type DocumentTableProps = {
  propertyId: string
  /** When false, only the document list is rendered (no card or heading). Use when parent provides section layout. */
  wrapInCard?: boolean
}

export default function DocumentTable({ propertyId, wrapInCard = true }: DocumentTableProps) {
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [driveImporting, setDriveImporting] = useState(false)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    loadData()
  }, [propertyId])

  async function loadData() {
    setLoading(true)
    try {
      const [typesResult, docsResult] = await Promise.all([
        getDocumentTypes(),
        getDocumentsForProperty(propertyId),
      ])

      if (typesResult.data) {
        setDocumentTypes(typesResult.data as DocumentType[])
      }

      if (docsResult.data) {
        setDocuments(docsResult.data as unknown as Document[])
      }
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }

  function inferDocumentTypeIdFromFileName(fileName: string): string | null {
    if (documentTypes.length === 0) return null
    const lower = fileName.toLowerCase()

    const epc = documentTypes.find((t) => t.name.toLowerCase().includes("epc"))
    if (epc && (lower.includes("epc") || lower.includes("peb"))) return epc.id

    const electrical = documentTypes.find((t) =>
      t.name.toLowerCase().includes("electrical")
    )
    if (electrical && lower.includes("electr")) return electrical.id

    const asbestos = documentTypes.find((t) =>
      t.name.toLowerCase().includes("asbestos")
    )
    if (asbestos && lower.includes("asbest")) return asbestos.id

    return documentTypes[0]?.id ?? null
  }

  async function uploadPdfFile(file: File, documentTypeId: string | null) {
    const formData = new FormData()
    formData.append("propertyId", propertyId)
    if (documentTypeId) {
      formData.append("documentTypeId", documentTypeId)
    }
    formData.append("file", file)
    const result = await uploadDocument(formData)
    if (!result.ok) {
      let errorMessage = result.error || "Upload failed"
      if (result.details) {
        const detailsStr = Object.entries(result.details)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
          .join("\n")
        errorMessage = `${errorMessage}\n\nDetails:\n${detailsStr}`
      }
      throw new Error(errorMessage)
    }
  }

  function getDocumentData(documentTypeId: string) {
    const doc = documents.find((d) => d.document_type_id === documentTypeId)
    if (!doc) {
      return {
        status: "Missing",
        document: null,
        analysisRun: null,
      }
    }

    const analysisRun = doc.analysis_runs?.[0] || null
    let status = doc.status

    if (analysisRun) {
      if (analysisRun.status === "queued") {
        status = "Queued"
      } else if (analysisRun.status === "processing") {
        status = "Processing"
      } else if (analysisRun.status === "done") {
        status = analysisRun.result_json?.status || "Done"
      } else if (analysisRun.status === "error") {
        status = "Error"
      }
    } else if (doc.status === "uploaded") {
      status = "Uploaded"
    }

    return {
      status,
      document: doc,
      analysisRun,
    }
  }

  async function handleRunAnalysis(documentId: string, analysisRunId: string) {
    setAnalyzing(analysisRunId)

    const formData = new FormData()
    formData.append("analysisRunId", analysisRunId)
    formData.append("documentId", documentId)
    formData.append("propertyId", propertyId)

    try {
      const result = await runAnalysis(formData)
      if (result.error) {
        alert(`Analysis failed: ${result.error}`)
      } else {
        await loadData()
      }
    } catch (error) {
      alert(`Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setAnalyzing(null)
    }
  }

  async function handleFileSelect(
    documentTypeId: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(documentTypeId)

    try {
      await uploadPdfFile(file, documentTypeId)
      await loadData()
    } catch (error) {
      alert(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setUploading(null)
      if (fileInputRefs.current[documentTypeId]) {
        fileInputRefs.current[documentTypeId]!.value = ""
      }
    }
  }

  async function handleGoogleDriveClick() {
    setDriveImporting(true)
    try {
      const files = await pickGoogleDrivePdfFiles()
      if (files.length === 0) return

      for (const file of files) {
        const documentTypeId = inferDocumentTypeIdFromFileName(file.name)
        await uploadPdfFile(file, documentTypeId)
      }
      await loadData()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Google Drive import failed")
    } finally {
      setDriveImporting(false)
    }
  }

  function handleUploadClick(documentTypeId: string) {
    fileInputRefs.current[documentTypeId]?.click()
  }

  function getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case "missing":
        return "text-red-600"
      case "uploaded":
        return "text-blue-600"
      case "queued":
        return "text-orange-600"
      case "processing":
        return "text-yellow-600"
      case "green":
        return "text-green-600"
      case "orange":
        return "text-orange-600"
      case "red":
        return "text-red-600"
      case "error":
        return "text-red-600"
      default:
        return "text-gray-600"
    }
  }

  if (loading) {
    return (
      <div className={wrapInCard ? "saas-card py-12" : "py-8"}>
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
          <p className="text-sm text-muted-foreground">Loading documents…</p>
        </div>
      </div>
    )
  }

  const content = (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-[hsl(var(--border))] bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Import from Google Drive</p>
          <p className="text-xs text-muted-foreground">
            Sign in with Google, choose PDFs from your Drive, then upload and analyze them like local files.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          {driveImporting && (
            <p className="flex items-center gap-2 rounded-full bg-background px-3 py-1 text-xs text-muted-foreground">
              <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
              Importing from Google Drive…
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleGoogleDriveClick()}
            disabled={driveImporting}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-foreground shadow-sm ring-1 ring-[hsl(var(--border))] hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary/10">
              <FileText className="h-3.5 w-3.5 text-primary" />
            </span>
            <span>Import from Google Drive</span>
          </button>
        </div>
      </div>
      {documentTypes.length === 0 ? (
        <div className="saas-empty-state">
          <FileQuestion className="h-12 w-12 sm:h-14 sm:w-14 saas-empty-state-icon" aria-hidden />
          <p className="saas-empty-state-title">No document types configured</p>
          <p className="saas-empty-state-description">
            Document types will appear here once they are set up for this property.
          </p>
        </div>
      ) : (
        documentTypes.map((docType) => {
          const { status, document, analysisRun } = getDocumentData(docType.id)
          const isUploading = uploading === docType.id
          const isAnalyzing = analyzing === analysisRun?.id
          const showRunAnalysis = analysisRun?.status === "queued"
          const showResults = analysisRun?.status === "done" && analysisRun.result_json

          return (
            <div
              key={docType.id}
              className="rounded-xl border border-[hsl(var(--card-border))] bg-card p-5 shadow-[var(--card-shadow)] space-y-4 transition-shadow hover:shadow-card-hover"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground">{docType.name}</h3>
                  <p className={`text-sm mt-1 ${getStatusColor(status)}`}>Status: {status}</p>
                  {showResults && analysisRun.result_json && (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-lg border border-[hsl(var(--border))] bg-muted/50 p-3 text-sm">
                        <p className="font-medium text-foreground">Summary</p>
                        <p className="mt-1 text-muted-foreground">{analysisRun.result_json.summary}</p>
                      </div>
                      {docType.name === "EPC" && (
                        <div className="rounded-lg border border-[hsl(var(--border))] bg-muted/50 p-3 text-sm space-y-1">
                          <p className="font-medium text-foreground">EPC Details</p>
                          {analysisRun.result_json.epc_score_letter && (
                            <p className="text-muted-foreground">
                              <span className="font-medium">EPC Score:</span>{" "}
                              {analysisRun.result_json.epc_score_letter}
                            </p>
                          )}
                          {analysisRun.result_json.energy_consumption_kwh_m2_year !== null &&
                            analysisRun.result_json.energy_consumption_kwh_m2_year !== undefined && (
                              <p className="text-muted-foreground">
                                <span className="font-medium">Energy Consumption:</span>{" "}
                                {analysisRun.result_json.energy_consumption_kwh_m2_year} kWh/m²/year
                              </p>
                            )}
                          {analysisRun.result_json.certificate_date && (
                            <p className="text-muted-foreground">
                              <span className="font-medium">Certificate Date:</span>{" "}
                              {analysisRun.result_json.certificate_date}
                            </p>
                          )}
                          {analysisRun.result_json.expiry_date && (
                            <p className="text-muted-foreground">
                              <span className="font-medium">Expiry Date:</span>{" "}
                              {analysisRun.result_json.expiry_date}
                            </p>
                          )}
                          {analysisRun.result_json.is_expired !== null &&
                            analysisRun.result_json.is_expired !== undefined && (
                              <p
                                className={`font-medium ${
                                  analysisRun.result_json.is_expired
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                <span className="font-medium">Expired Status:</span>{" "}
                                {analysisRun.result_json.is_expired ? "EXPIRED" : "Valid"}
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-2">
                  {showRunAnalysis && document && analysisRun && (
                    <button
                      onClick={() => handleRunAnalysis(document.id, analysisRun.id)}
                      disabled={isAnalyzing}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
                    >
                      <Play className="h-4 w-4" />
                      {isAnalyzing ? "Running…" : "Run Analysis"}
                    </button>
                  )}
                  <input
                    ref={(el) => {
                      fileInputRefs.current[docType.id] = el
                    }}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleFileSelect(docType.id, e)}
                    disabled={isUploading}
                  />
                  <button
                    onClick={() => handleUploadClick(docType.id)}
                    disabled={isUploading}
                    className="saas-btn-primary"
                  >
                    <Upload className="h-4 w-4" />
                    {isUploading ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )

  if (wrapInCard) {
    return (
      <div className="saas-card">
        <h2 className="saas-section-heading mb-6">Documents</h2>
        {content}
      </div>
    )
  }

  return <>{content}</>
}
