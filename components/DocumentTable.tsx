"use client"

import { useState, useRef, useEffect } from "react"
import { Upload, Play } from "lucide-react"
import { uploadDocument } from "@/app/actions/upload-document"
import { getDocumentTypes, getDocumentsForProperty } from "@/app/actions/get-documents"
import { runAnalysis } from "@/app/actions/run-analysis"

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

export default function DocumentTable({ propertyId }: { propertyId: string }) {
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
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

    const formData = new FormData()
    formData.append("documentTypeId", documentTypeId)
    formData.append("file", file)

    try {
      const result = await uploadDocument(formData)
      if (!result.ok) {
        // Show detailed error message
        let errorMessage = result.error || "Upload failed"
        if (result.details) {
          const detailsStr = Object.entries(result.details)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
            .join("\n")
          errorMessage = `${errorMessage}\n\nDetails:\n${detailsStr}`
        }
        alert(errorMessage)
      } else {
        await loadData()
      }
    } catch (error) {
      alert(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setUploading(null)
      // Reset file input
      if (fileInputRefs.current[documentTypeId]) {
        fileInputRefs.current[documentTypeId]!.value = ""
      }
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
      <div className="rounded-lg border bg-card p-6">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-xl font-semibold mb-6">Documents</h2>
      <div className="space-y-4">
        {documentTypes.map((docType) => {
          const { status, document, analysisRun } = getDocumentData(docType.id)
          const isUploading = uploading === docType.id
          const isAnalyzing = analyzing === analysisRun?.id
          const showRunAnalysis = analysisRun?.status === "queued"
          const showResults = analysisRun?.status === "done" && analysisRun.result_json

          return (
            <div
              key={docType.id}
              className="p-4 border rounded-lg space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-medium">{docType.name}</h3>
                  <p className={`text-sm mt-1 ${getStatusColor(status)}`}>
                    Status: {status}
                  </p>
                  {showResults && analysisRun.result_json && (
                    <div className="mt-2 p-2 bg-muted rounded text-sm">
                      <p className="font-medium">Summary:</p>
                      <p className="text-muted-foreground">
                        {analysisRun.result_json.summary}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {showRunAnalysis && document && analysisRun && (
                    <button
                      onClick={() =>
                        handleRunAnalysis(document.id, analysisRun.id)
                      }
                      disabled={isAnalyzing}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Play className="w-4 h-4" />
                      {isAnalyzing ? "Running..." : "Run Analysis"}
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
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-4 h-4" />
                    {isUploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
