"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Upload, Play, RotateCw, FileQuestion, FileText, MapPin } from "lucide-react"
import { uploadDocument } from "@/app/actions/upload-document"
import { verifyDocumentAddress } from "@/app/actions/verify-document-address"
import { getDocumentTypes, getDocumentsForProperty } from "@/app/actions/get-documents"
import { runAnalysis } from "@/app/actions/run-analysis"
import { pickLatestAnalysisRun } from "@/lib/pick-latest-analysis-run"
import { DocumentPreviewButton } from "@/components/property/DocumentPreviewButton"
import {
  VISIBLE_DOCUMENT_TYPE_NAMES,
  NON_ANALYZED_DOCUMENT_TYPE_NAMES,
} from "@/lib/property-status"

const VISIBLE_DOC_TYPE_SET: ReadonlySet<string> = new Set(VISIBLE_DOCUMENT_TYPE_NAMES)
const NON_ANALYZED_DOC_TYPE_SET: ReadonlySet<string> = new Set(NON_ANALYZED_DOCUMENT_TYPE_NAMES)
const DOC_TYPE_ORDER: Map<string, number> = new Map(
  VISIBLE_DOCUMENT_TYPE_NAMES.map((name, idx) => [name, idx]),
)

const DOC_TYPE_DUTCH_LABELS: Record<string, string> = {
  EPC: "EPC",
  ASBESTOS: "Asbestattest",
  ELECTRICAL: "Elektrische keuring",
  SOIL_CERTIFICATE: "Bodemattest",
  URBAN_PLANNING_INFO: "Stedenbouwkundige inlichtingen",
}

function dutchDocTypeLabel(name: string): string {
  return DOC_TYPE_DUTCH_LABELS[name] ?? name
}

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

type AnalysisRunErrorPayload = { analysisError: string }

type AnalysisRunResultJson = AnalysisResult | AnalysisRunErrorPayload

function isAnalysisErrorPayload(json: AnalysisRunResultJson | null | undefined): json is AnalysisRunErrorPayload {
  return (
    typeof json === "object" &&
    json !== null &&
    "analysisError" in json &&
    typeof (json as AnalysisRunErrorPayload).analysisError === "string"
  )
}

type AnalysisRun = {
  id: string
  status: string
  created_at?: string
  result_json: AnalysisRunResultJson | null
  model_name?: string | null
}

type Document = {
  id: string
  property_id: string
  document_type_id: string | null
  storage_path: string
  status: string
  created_at: string
  expected_property_id?: string | null
  expected_address?: string | null
  extracted_document_address?: string | null
  address_match_status?: string | null
  address_match_confidence?: number | null
  address_match_reason?: string | null
  address_match_user_overridden?: boolean | null
  document_types: DocumentType | null
  analysis_runs: AnalysisRun[] | null
}

type DocumentTableProps = {
  propertyId: string
  /** When false, only the document list is rendered (no card or heading). Use when parent provides section layout. */
  wrapInCard?: boolean
}

type ReanalyzePrompt = {
  docTypeId: string
  documentId: string
  analysisRunId: string
  docTypeLabel: string
}

export default function DocumentTable({ propertyId, wrapInCard = true }: DocumentTableProps) {
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [verifyingAddress, setVerifyingAddress] = useState<string | null>(null)
  const [driveImporting, setDriveImporting] = useState(false)
  const [feedbackByDocType, setFeedbackByDocType] = useState<Record<string, string>>({})
  const [driveFeedback, setDriveFeedback] = useState<string | null>(null)
  const [reanalyzePrompt, setReanalyzePrompt] = useState<ReanalyzePrompt | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [typesResult, docsResult] = await Promise.all([
        getDocumentTypes(),
        getDocumentsForProperty(propertyId),
      ])

      if (typesResult.data) {
        // Show only the doc types the realtor uploads in this prototype, in a
        // fixed display order. The other types still exist in the DB (used by
        // Smart Export's "manual_documents" tagging) but stay off this table.
        const filtered = (typesResult.data as DocumentType[])
          .filter((t) => VISIBLE_DOC_TYPE_SET.has(t.name))
          .sort(
            (a, b) =>
              (DOC_TYPE_ORDER.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
              (DOC_TYPE_ORDER.get(b.name) ?? Number.MAX_SAFE_INTEGER),
          )
        setDocumentTypes(filtered)
      }

      if (docsResult.data) {
        setDocuments(docsResult.data as unknown as Document[])
      }
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => {
    void loadData()
  }, [loadData])

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

  async function uploadPdfFile(
    file: File,
    documentTypeId: string | null
  ): Promise<{ documentId: string; analysisRunId: string }> {
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
    if (!result.documentId || !result.analysisRunId) {
      throw new Error("Upload geslaagd maar ontbrekende document- of analyse-run-id.")
    }
    return { documentId: result.documentId, analysisRunId: result.analysisRunId }
  }

  /**
   * Per-row file input path: upload → verify address (cheap, no Gemini) → refresh list. Analysis is
   * intentionally NOT auto-triggered — Gemini credits are only spent when the realtor explicitly
   * clicks "Analyse uitvoeren" on the row.
   */
  async function uploadPdfThroughManualPipeline(
    file: File,
    documentTypeId: string,
    afterLoadData?: () => void
  ) {
    const { documentId } = await uploadPdfFile(file, documentTypeId)
    const verifyFd = new FormData()
    verifyFd.append("documentId", documentId)
    await verifyDocumentAddress(verifyFd)
    await loadData()
    afterLoadData?.()
  }

  function getDocumentData(documentTypeId: string) {
    // Intake-linked PDFs get a real `document_type_id` in `attachDocumentToProperty`; pick the latest row per type
    // so verification rows match manual uploads (including re-uploads).
    const candidates = documents.filter((d) => d.document_type_id === documentTypeId)
    if (!candidates.length) {
      return {
        status: "Missing",
        document: null,
        analysisRun: null,
      }
    }
    const doc = candidates.reduce((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      return tb >= ta ? b : a
    })

    const analysisRun = pickLatestAnalysisRun(doc.analysis_runs) || null
    let status = doc.status

    if (analysisRun) {
      if (analysisRun.status === "queued") {
        status = "Nog niet geanalyseerd"
      } else if (analysisRun.status === "processing") {
        status = "Processing"
      } else if (analysisRun.status === "done") {
        if (isAnalysisErrorPayload(analysisRun.result_json)) {
          status = "Fout"
        } else {
          status = analysisRun.result_json?.status || "Done"
        }
      } else if (analysisRun.status === "error") {
        status = "Fout"
      }
    } else if (doc.status === "uploaded") {
      status = "Nog niet geanalyseerd"
    }

    return {
      status,
      document: doc,
      analysisRun,
    }
  }

  async function handleRunAnalysis(
    docTypeId: string,
    documentId: string,
    analysisRunId: string,
    options?: { force?: boolean }
  ) {
    setAnalyzing(analysisRunId)
    setFeedbackByDocType((prev) => {
      const next = { ...prev }
      delete next[docTypeId]
      return next
    })

    const formData = new FormData()
    formData.append("analysisRunId", analysisRunId)
    formData.append("documentId", documentId)
    formData.append("propertyId", propertyId)
    if (options?.force) {
      formData.append("force", "1")
    }

    try {
      const result = await runAnalysis(formData)
      await loadData()
      if (result.error && result.persistedToDb !== true) {
        setFeedbackByDocType((prev) => ({ ...prev, [docTypeId]: result.error! }))
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Onbekende fout"
      await loadData()
      setFeedbackByDocType((prev) => ({ ...prev, [docTypeId]: msg }))
    } finally {
      setAnalyzing(null)
    }
  }

  function requestRunAnalysis(
    docTypeId: string,
    documentId: string,
    analysisRunId: string,
    isAlreadyDone: boolean,
    docTypeLabel: string
  ) {
    if (isAlreadyDone) {
      setReanalyzePrompt({ docTypeId, documentId, analysisRunId, docTypeLabel })
      return
    }
    void handleRunAnalysis(docTypeId, documentId, analysisRunId)
  }

  async function confirmReanalyze() {
    if (!reanalyzePrompt) return
    const prompt = reanalyzePrompt
    setReanalyzePrompt(null)
    await handleRunAnalysis(prompt.docTypeId, prompt.documentId, prompt.analysisRunId, { force: true })
  }

  async function handleVerifyAddress(documentTypeId: string, documentId: string) {
    setVerifyingAddress(documentId)
    setFeedbackByDocType((prev) => {
      const next = { ...prev }
      delete next[documentTypeId]
      return next
    })

    try {
      const formData = new FormData()
      formData.append("documentId", documentId)
      const result = await verifyDocumentAddress(formData)
      await loadData()
      if (!result.ok) {
        setFeedbackByDocType((prev) => ({
          ...prev,
          [documentTypeId]: result.error || "Adrescontrole mislukt.",
        }))
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Adrescontrole mislukt."
      setFeedbackByDocType((prev) => ({ ...prev, [documentTypeId]: msg }))
    } finally {
      setVerifyingAddress(null)
    }
  }

  async function handleFileSelect(
    documentTypeId: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(documentTypeId)
    setFeedbackByDocType((prev) => {
      const next = { ...prev }
      delete next[documentTypeId]
      return next
    })

    try {
      await uploadPdfThroughManualPipeline(file, documentTypeId, () => setUploading(null))
      await loadData()
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Upload mislukt."
      setFeedbackByDocType((prev) => ({ ...prev, [documentTypeId]: msg }))
    } finally {
      setUploading(null)
      if (fileInputRefs.current[documentTypeId]) {
        fileInputRefs.current[documentTypeId]!.value = ""
      }
    }
  }

  async function handleGoogleDriveClick() {
    setDriveImporting(true)
    setDriveFeedback(null)
    try {
      const { pickGoogleDrivePdfFiles } = await import("@/lib/google-drive/picker-flow")
      const files = await pickGoogleDrivePdfFiles()
      if (files.length === 0) return

      for (const file of files) {
        const documentTypeId = inferDocumentTypeIdFromFileName(file.name)
        if (!documentTypeId) {
          throw new Error(
            "Geen documenttype herkend in de bestandsnaam. Hernoem het bestand (bijv. epc, asbest, elektrisch) of upload via de juiste rij."
          )
        }
        await uploadPdfThroughManualPipeline(file, documentTypeId, () => setUploading(null))
        await loadData()
      }
    } catch (error) {
      setDriveFeedback(
        error instanceof Error ? error.message : "Google Drive-import mislukt."
      )
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
      case "queued":
      case "nog niet geanalyseerd":
        return "text-slate-600"
      case "processing":
        return "text-yellow-600"
      case "green":
        return "text-green-600"
      case "orange":
        return "text-orange-600"
      case "red":
        return "text-red-600"
      case "fout":
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
      {driveFeedback && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <span className="font-medium">Google Drive: </span>
          {driveFeedback}
        </div>
      )}
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
          const isNonAnalyzed = NON_ANALYZED_DOC_TYPE_SET.has(docType.name)
          /** Terminal runs no longer "busy" — avoids a frame where fresh data is `done` but `analyzing` is not cleared yet (after loadData, before finally). */
          const analysisRunTerminal =
            analysisRun?.status === "done" || analysisRun?.status === "error"
          const isAnalyzing =
            analyzing === analysisRun?.id && !analysisRunTerminal
          const isAlreadyDone = analysisRun?.status === "done"
          const showRunAnalysis =
            !isNonAnalyzed &&
            !!analysisRun &&
            !isAnalyzing &&
            (analysisRun.status === "queued" ||
              analysisRun.status === "done" ||
              analysisRun.status === "error")
          const isVerifyingAddr = document ? verifyingAddress === document.id : false
          const showVerifyAddress = isNonAnalyzed && Boolean(document)
          const statusForDisplay = isAnalyzing ? "Bezig met analyseren…" : status
          const statusColorClass = getStatusColor(
            isAnalyzing ? "processing" : status
          )
          const rowFeedback = feedbackByDocType[docType.id]
          const persistedAnalysisError =
            analysisRun?.status === "error" && isAnalysisErrorPayload(analysisRun.result_json)
              ? analysisRun.result_json.analysisError
              : null
          const showResults =
            analysisRun?.status === "done" &&
            analysisRun.result_json &&
            !isAnalysisErrorPayload(analysisRun.result_json)
          const usedGroqFallback = Boolean(analysisRun?.model_name?.startsWith("groq:"))

          return (
            <div
              key={docType.id}
              className="space-y-4 rounded-2xl border border-[hsl(var(--card-border))] bg-white p-6 shadow-sm transition-all duration-200 hover:border-brand-light/45 hover:shadow-md dark:bg-card"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="font-semibold text-foreground">{dutchDocTypeLabel(docType.name)}</h3>
                  {NON_ANALYZED_DOC_TYPE_SET.has(docType.name) && (
                    <p className="text-xs italic text-muted-foreground">
                      Geen automatische analyse — handmatig op te laden voor het dossier
                    </p>
                  )}
                  <p className={`text-sm ${statusColorClass}`}>
                    Status: {statusForDisplay}
                  </p>
                  {usedGroqFallback && analysisRun?.status === "done" && (
                    <p className="text-xs italic text-muted-foreground">
                      Geanalyseerd via fallback-model (Gemini was tijdelijk niet beschikbaar)
                    </p>
                  )}
                  {isNonAnalyzed && document && (
                    <AddressMatchPill
                      status={document.address_match_status ?? null}
                      reason={document.address_match_reason ?? null}
                      verifying={isVerifyingAddr}
                    />
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-2">
                  {showRunAnalysis && document && analysisRun && (
                    <button
                      onClick={() =>
                        requestRunAnalysis(
                          docType.id,
                          document.id,
                          analysisRun.id,
                          isAlreadyDone,
                          dutchDocTypeLabel(docType.name)
                        )
                      }
                      disabled={isAnalyzing}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
                    >
                      {isAlreadyDone ? <RotateCw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {isAnalyzing
                        ? "Running…"
                        : isAlreadyDone
                          ? "Opnieuw analyseren"
                          : "Analyseren"}
                    </button>
                  )}
                  {showVerifyAddress && document && (
                    <button
                      onClick={() => handleVerifyAddress(docType.id, document.id)}
                      disabled={isVerifyingAddr}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
                      title="Vergelijk het adres in het PDF met het adres van het pand"
                    >
                      <MapPin className="h-4 w-4" />
                      {isVerifyingAddr ? "Bezig…" : "Adres controleren"}
                    </button>
                  )}
                  {document && (
                    <DocumentPreviewButton
                      documentId={document.id}
                      label={dutchDocTypeLabel(docType.name)}
                    />
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

              {rowFeedback && (
                <div
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  role="alert"
                >
                  {rowFeedback}
                </div>
              )}

              {persistedAnalysisError && (
                <div
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  role="alert"
                >
                  <p className="font-medium text-destructive">Analyse mislukt</p>
                  <p className="mt-1 text-destructive/90">{persistedAnalysisError}</p>
                </div>
              )}

              {showResults && analysisRun.result_json && !isAnalysisErrorPayload(analysisRun.result_json) && (
                <div className="rounded-lg border border-[hsl(var(--border))] bg-muted/50 px-4 py-3.5 text-sm">
                  <p className="font-medium text-foreground">Summary</p>
                  <div className="mt-2 space-y-1.5 leading-relaxed text-muted-foreground">
                    {(() => {
                      const result = analysisRun.result_json as AnalysisResult
                      const lines = result.summary
                        .split("|")
                        .map((part) => part.trim())
                        .filter(Boolean)

                      return lines.map((line, idx) => <p key={`${analysisRun.id}-summary-${idx}`}>{line}</p>)
                    })()}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )

  const reanalyzeModal = reanalyzePrompt ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reanalyze-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setReanalyzePrompt(null)
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-card">
        <h3 id="reanalyze-modal-title" className="text-base font-bold text-foreground">
          Opnieuw analyseren?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Het document <span className="font-semibold text-foreground">{reanalyzePrompt.docTypeLabel}</span> is
          al geanalyseerd. Opnieuw analyseren start een nieuwe AI-analyse en gebruikt opnieuw
          Gemini-credits. Doorgaan?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setReanalyzePrompt(null)}
            className="inline-flex items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={() => void confirmReanalyze()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
          >
            <RotateCw className="h-4 w-4" />
            Ja, opnieuw analyseren
          </button>
        </div>
      </div>
    </div>
  ) : null

  if (wrapInCard) {
    return (
      <div className="saas-card">
        <h2 className="saas-section-heading mb-6">Documents</h2>
        {content}
        {reanalyzeModal}
      </div>
    )
  }

  return (
    <>
      {content}
      {reanalyzeModal}
    </>
  )
}

function AddressMatchPill({
  status,
  reason,
  verifying,
}: {
  status: string | null
  reason: string | null
  verifying: boolean
}) {
  if (verifying) {
    return (
      <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
        Adres controleren…
      </p>
    )
  }

  if (!status) {
    return (
      <p className="mt-1 text-xs italic text-muted-foreground">
        Adres nog niet gecontroleerd. Klik op &quot;Adres controleren&quot; om te valideren.
      </p>
    )
  }

  const styles: Record<string, { className: string; label: string }> = {
    match: {
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      label: "Adres komt overeen met pand",
    },
    possible_match: {
      className: "border-amber-200 bg-amber-50 text-amber-800",
      label: "Mogelijke match — controleer handmatig",
    },
    mismatch: {
      className: "border-red-200 bg-red-50 text-red-800",
      label: "Adres komt NIET overeen met pand",
    },
    unknown: {
      className: "border-gray-200 bg-gray-50 text-gray-700",
      label: "Adres niet herkend in document",
    },
  }
  const conf = styles[status] ?? styles.unknown
  return (
    <div className="mt-1.5 space-y-1">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${conf.className}`}
      >
        {conf.label}
      </span>
      {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
    </div>
  )
}

