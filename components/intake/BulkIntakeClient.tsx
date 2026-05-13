"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Upload,
  FileText,
  AlertTriangle,
  Cloud,
  Loader2,
  RefreshCw,
  FolderOpen,
  FolderInput,
  Trash2,
} from "lucide-react"

import type { IntakeUploadRow, IntakeProcessingStatus } from "@/lib/intake/types"
import { bulkIntakeUpload } from "@/app/actions/bulk-intake-upload"
import { processIntakeUploads } from "@/app/actions/process-intake-uploads"
import {
  collectPdfFilesFromDataTransfer,
  dedupePdfInputs,
  type PdfFileWithPath,
} from "@/lib/intake/collect-pdf-files"
import { IntakeManualPropertyForm } from "@/components/intake/IntakeManualPropertyForm"
import { cn } from "@/lib/utils"
import type { IntakePropertyOption } from "@/app/actions/get-intake-property-options"
import { deleteIntakeUpload } from "@/app/actions/delete-intake-upload"

/** Batch size per server round-trip to keep FormData and processing bounded for large folders. */
const UPLOAD_CHUNK_SIZE = 30

const INTAKE_SESSION_CUTOFF_KEY = "intake_queue_session_cutoff_iso"

function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes < 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function shortId(id: string | null): string {
  if (!id) return "—"
  return `${id.slice(0, 8)}…`
}

function statusBadgeClass(status: IntakeProcessingStatus): string {
  switch (status) {
    case "uploaded":
      return "border-brand-light/40 bg-brand-light/15 text-brand-dark"
    case "processing":
      return "border-amber-300/80 bg-amber-100 text-amber-900"
    case "processed":
      return "border-emerald-300/80 bg-emerald-50 text-emerald-900"
    case "failed":
      return "border-red-300/80 bg-red-50 text-red-900"
    case "needs_review":
      return "border-orange-300/80 bg-orange-50 text-orange-900"
    default:
      return "border-border bg-muted text-muted-foreground"
  }
}

/** User-facing queue state (per-file); distinct from raw `processing_status` for Matched vs Created. */
function formatQueueStatus(row: IntakeUploadRow): string {
  const s = row.processing_status
  if (row.matched_property_id) return "Matched"
  if (row.created_property_id) return "Created"
  if (s === "uploaded") return "Pending"
  if (s === "processing") return "Processing"
  if (s === "needs_review") return "Needs review"
  if (s === "failed") return "Failed"
  if (s === "processed") return "Processed"
  return (s as string).replace(/_/g, " ")
}

function formatConfidencePercent(score: number | null): string {
  if (score == null || Number.isNaN(score)) return "—"
  return `${Math.round(score * 100)}%`
}

function matchTierFromScore(score: number | null): string {
  if (score == null || Number.isNaN(score)) return "—"
  if (score >= 0.88) return "Strong"
  if (score >= 0.72) return "Medium"
  return "Low"
}

function localStatusBadgeClass(status: LocalQueueRow["status"]): string {
  switch (status) {
    case "uploading":
    case "processing":
      return "border-amber-300/80 bg-amber-100 text-amber-900"
    case "processed":
      return "border-emerald-300/80 bg-emerald-50 text-emerald-900"
    case "failed":
      return "border-red-300/80 bg-red-50 text-red-900"
  }
}

function canEnterPropertyManually(row: IntakeUploadRow, propId: string | null): boolean {
  if (propId) return false
  return row.processing_status === "needs_review" || row.processing_status === "failed"
}

function formatIntakeMatchSummary(row: IntakeUploadRow): string {
  if (row.created_property_id) {
    return `Created property - ${matchTierFromScore(row.confidence_score)} match / extraction`
  }
  if (row.matched_property_id) {
    return `Linked to existing - ${matchTierFromScore(row.confidence_score)}`
  }
  if (row.processing_status === "failed") {
    return row.error_message?.slice(0, 120) ?? "Processing failed"
  }
  if (row.processing_status === "needs_review") {
    return row.error_message?.slice(0, 160) ?? "Manual review"
  }
  if (row.created_property_id) {
    return `Created property · ${matchTierFromScore(row.confidence_score)} match / extraction`
  }
  if (row.matched_property_id) {
    return `Linked to existing · ${matchTierFromScore(row.confidence_score)}`
  }
  if (row.processing_status === "uploaded" || row.processing_status === "processing") {
    return "Awaiting pipeline…"
  }
  return "—"
}

type BulkIntakeClientProps = {
  initialRows: IntakeUploadRow[]
  loadError: string | null
  propertyOptions: IntakePropertyOption[]
}

type LocalQueueRow = {
  key: string
  filename: string
  relativePath: string | null
  size: number
  status: "uploading" | "processing" | "processed" | "failed"
  message: string | null
}

export function BulkIntakeClient({ initialRows, loadError, propertyOptions }: BulkIntakeClientProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [driveImporting, setDriveImporting] = useState(false)
  const [driveFeedback, setDriveFeedback] = useState<string | null>(null)
  const [manualFormIntakeId, setManualFormIntakeId] = useState<string | null>(null)
  const [localQueueRows, setLocalQueueRows] = useState<LocalQueueRow[]>([])
  const [deletingIntakeId, setDeletingIntakeId] = useState<string | null>(null)
  /** Per-tab session: only rows created after this ISO time (stored in sessionStorage). */
  const [sessionCutoffIso, setSessionCutoffIso] = useState<string | null>(null)
  const [showFullHistory, setShowFullHistory] = useState(false)

  useEffect(() => {
    try {
      let iso = sessionStorage.getItem(INTAKE_SESSION_CUTOFF_KEY)
      if (!iso) {
        iso = new Date().toISOString()
        sessionStorage.setItem(INTAKE_SESSION_CUTOFF_KEY, iso)
      }
      setSessionCutoffIso(iso)
    } catch {
      setSessionCutoffIso(new Date().toISOString())
    }
  }, [])

  // Auto-recover queue rows stranded by a previous tab / timeout. processIntakeUploads([]) is
  // a no-op when nothing is stuck, otherwise it resets >2-minute "processing" rows back to
  // "uploaded" and drains the queue. Runs once per mount.
  const recoveryAttemptedRef = useRef(false)
  useEffect(() => {
    if (recoveryAttemptedRef.current) return
    const hasStuck = initialRows.some(
      (r) =>
        r.processing_status === "processing" ||
        r.processing_status === "uploaded" ||
        r.processing_status === "needs_review"
    )
    if (!hasStuck) return
    recoveryAttemptedRef.current = true
    void (async () => {
      try {
        const res = await drainIntakeQueue([])
        if (res.ok) router.refresh()
      } catch {
        /* silent — manual upload flow still works */
      }
    })()
  }, [initialRows, router])

  const queueRows = useMemo(() => {
    if (showFullHistory || !sessionCutoffIso) return initialRows
    const t = Date.parse(sessionCutoffIso)
    if (Number.isNaN(t)) return initialRows
    return initialRows.filter((r) => Date.parse(r.created_at) >= t)
  }, [initialRows, sessionCutoffIso, showFullHistory])

  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  const updateLocalQueueRows = useCallback((keys: string[], patch: Partial<LocalQueueRow>) => {
    const keySet = new Set(keys)
    setLocalQueueRows((prev) =>
      prev.map((row) => (keySet.has(row.key) ? { ...row, ...patch } : row))
    )
  }, [])

  async function drainIntakeQueue(initialIds: string[]) {
    let ids = initialIds
    let lastResult: Awaited<ReturnType<typeof processIntakeUploads>> = {
      ok: true,
      processedCount: 0,
      remainingCount: 0,
    }
    for (let guard = 0; guard < 40; guard++) {
      lastResult = await processIntakeUploads(ids)
      if (!lastResult.ok) return lastResult
      if ((lastResult.remainingCount ?? 0) <= 0) return lastResult
      ids = []
    }
    return {
      ok: false,
      error: "Intake queue is still not empty after multiple processing batches. Refresh and process again.",
    }
  }

  async function handleDeleteQueueRow(row: IntakeUploadRow) {
    const linked = Boolean(row.matched_property_id || row.created_property_id || row.processing_status === "processed")
    if (row.processing_status === "processing" && !linked) {
      setMessage({ type: "err", text: "This file is currently processing. Try again after it finishes." })
      return
    }
    const ok = window.confirm(
      linked
        ? "Remove this row from the intake queue? The linked property document will stay in place."
        : "Delete this intake upload? The queued file will be removed."
    )
    if (!ok) return

    setDeletingIntakeId(row.id)
    setMessage(null)
    try {
      const res = await deleteIntakeUpload({ intakeUploadId: row.id })
      if (!res.ok) {
        setMessage({ type: "err", text: res.error ?? "Could not delete intake upload." })
        return
      }
      setMessage({ type: "ok", text: "Intake queue row deleted." })
      router.refresh()
    } finally {
      setDeletingIntakeId(null)
    }
  }

  const handlePdfRows = useCallback(
    async (rowsIn: PdfFileWithPath[], options?: { skippedNonPdf?: number }) => {
      const rows = dedupePdfInputs(rowsIn.filter((r) => r.file.size > 0))
      if (!rows.length) {
        const skipped = options?.skippedNonPdf ?? 0
        setMessage({
          type: "err",
          text:
            skipped > 0
              ? `No PDF files found (${skipped} non-PDF file(s) skipped).`
              : "No PDF files to upload.",
        })
        return
      }

      setMessage(null)
      setIsWorking(true)
      const localRows: LocalQueueRow[] = rows.map(({ file, relativePath }, index) => ({
        key: `${relativePath}\0${file.size}\0${file.lastModified}\0${index}`,
        filename: file.name,
        relativePath,
        size: file.size,
        status: "uploading",
        message: "Uploading",
      }))
      setLocalQueueRows((prev) => [...localRows, ...prev])
      try {
        let totalOk = 0
        const errorParts: string[] = []

        for (let offset = 0; offset < rows.length; offset += UPLOAD_CHUNK_SIZE) {
          const chunk = rows.slice(offset, offset + UPLOAD_CHUNK_SIZE)
          const localChunk = localRows.slice(offset, offset + UPLOAD_CHUNK_SIZE)
          const localKeys = localChunk.map((row) => row.key)
          updateLocalQueueRows(localKeys, { status: "uploading", message: "Uploading" })
          const formData = new FormData()
          for (const { file, relativePath } of chunk) {
            formData.append("files", file)
            formData.append("relativePaths", relativePath)
          }

          const res = await bulkIntakeUpload(formData)
          if (!res.ok && !res.results.some((r) => r.intakeId)) {
            updateLocalQueueRows(localKeys, { status: "failed", message: res.error ?? "Upload failed" })
            setMessage({
              type: "err",
              text: res.error ?? "Upload failed.",
            })
            router.refresh()
            return
          }

          const errors = res.results.filter((r) => r.error)
          const okIds = res.results.map((r) => r.intakeId).filter(Boolean) as string[]
          const okLocalKeys: string[] = []
          res.results.forEach((result, idx) => {
            const local = localChunk[idx]
            if (!local) return
            if (!result.error && result.intakeId) okLocalKeys.push(local.key)
            updateLocalQueueRows([local.key], result.error
              ? { status: "failed", message: result.error }
              : { status: "processing", message: "Matching and analyzing" }
            )
          })
          totalOk += okIds.length

          for (const e of errors) {
            errorParts.push(`${e.filename}: ${e.error}`)
          }

          if (okIds.length) {
            const procRes = await drainIntakeQueue(okIds)
            if (!procRes.ok) {
              updateLocalQueueRows(okLocalKeys, { status: "failed", message: procRes.error ?? "Processing failed" })
              setMessage({
                type: "err",
                text: procRes.error ?? "Processing failed.",
              })
            } else {
              updateLocalQueueRows(okLocalKeys, { status: "processed", message: "Processed" })
            }
          }
        }

        const extra =
          options?.skippedNonPdf && options.skippedNonPdf > 0
            ? ` ${options.skippedNonPdf} non-PDF file(s) were skipped.`
            : ""

        if (errorParts.length) {
          setMessage({
            type: "err",
            text: `Some files failed (${errorParts.length}): ${errorParts.slice(0, 5).join("; ")}${errorParts.length > 5 ? "…" : ""}.${extra}`,
          })
        } else {
          setMessage({
            type: "ok",
            text: `${totalOk} PDF(s) uploaded, matched to properties and analyzed where possible.${extra}`,
          })
        }

        router.refresh()
        setLocalQueueRows((prev) => prev.filter((row) => row.status === "failed"))
      } finally {
        setIsWorking(false)
      }
    },
    [router, updateLocalQueueRows]
  )

  const handleGoogleDriveClick = useCallback(async () => {
    setDriveImporting(true)
    setDriveFeedback(null)
    try {
      const { pickGoogleDrivePdfFiles } = await import("@/lib/google-drive/picker-flow")
      const files = await pickGoogleDrivePdfFiles()
      if (files.length === 0) return
      const mapped: PdfFileWithPath[] = files.map((f) => ({
        file: f,
        relativePath: f.name,
      }))
      await handlePdfRows(mapped)
    } catch (e) {
      setDriveFeedback(e instanceof Error ? e.message : "Google Drive import mislukt.")
    } finally {
      setDriveImporting(false)
    }
  }, [handlePdfRows])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      void (async () => {
        const { files, stats } = await collectPdfFilesFromDataTransfer(e.dataTransfer)
        await handlePdfRows(files, { skippedNonPdf: stats.skippedNonPdf })
      })()
    },
    [handlePdfRows]
  )

  return (
    <div className="space-y-8">
      {loadError && (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          Could not load intake queue: {loadError}
        </div>
      )}

      <section className="saas-card space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-dark">Upload documents</h2>
            <p className="text-sm text-muted-foreground">
              PDFs only: EPC, asbestattest, elektrische keuring, bodemattest en stedenbouwkundige inlichtingen.
              SmartDoc koppelt ze aan het juiste pand en start daarna de analyse.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm font-medium text-brand-dark shadow-sm transition hover:bg-muted/40"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragOver
              ? "border-brand-light bg-brand-light/10"
              : "border-[hsl(var(--border))] bg-muted/20 hover:border-brand-light/50 hover:bg-brand-light/5"
          )}
        >
          <div className="rounded-full bg-brand-dark/10 p-4 text-brand-dark">
            <Upload className="h-8 w-8" />
          </div>
          <p className="mt-4 font-medium text-brand-dark">Drag & drop PDFs or folders here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click to pick files, or use the Choose folder control below. Nested folders are scanned (PDFs only; up to 500
            files per drop).
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const fl = e.target.files
              if (fl?.length) {
                const mapped: PdfFileWithPath[] = Array.from(fl).map((f) => ({
                  file: f,
                  relativePath: (f.webkitRelativePath && f.webkitRelativePath.length > 0
                    ? f.webkitRelativePath
                    : f.name
                  ).replace(/\\/g, "/"),
                }))
                void handlePdfRows(mapped)
              }
              e.target.value = ""
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            disabled={isWorking || driveImporting}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-light/50 bg-brand-light/10 px-4 py-2.5 text-sm font-semibold text-brand-dark shadow-sm transition hover:bg-brand-light/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FolderInput className="h-4 w-4" />
            Choose folder
          </button>
          <input
            ref={(el) => {
              folderInputRef.current = el
              if (el) {
                el.setAttribute("webkitdirectory", "")
                el.setAttribute("directory", "")
              }
            }}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const fl = e.target.files
              if (fl?.length) {
                const mapped: PdfFileWithPath[] = Array.from(fl).map((f) => ({
                  file: f,
                  relativePath: (f.webkitRelativePath && f.webkitRelativePath.length > 0
                    ? f.webkitRelativePath
                    : f.name
                  ).replace(/\\/g, "/"),
                }))
                void handlePdfRows(mapped)
              }
              e.target.value = ""
            }}
          />

          <button
            type="button"
            onClick={() => void handleGoogleDriveClick()}
            disabled={isWorking || driveImporting}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-light/50 bg-white px-4 py-2.5 text-sm font-semibold text-brand-dark shadow-sm ring-1 ring-brand-light/30 transition hover:bg-brand-light/10 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Import PDFs from Google Drive"
          >
            {driveImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Cloud className="h-4 w-4 text-brand-light" />
            )}
            {driveImporting ? "Importing from Drive…" : "Import from Google Drive"}
          </button>

        </div>

        {isWorking && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-brand-light" />
            Uploading and matching properties…
          </div>
        )}

        {message && (
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              message.type === "ok"
                ? "border border-emerald-200/80 bg-emerald-50 text-emerald-900"
                : "border border-destructive/30 bg-destructive/10 text-destructive"
            )}
            role="status"
          >
            {message.text}
          </div>
        )}
        {driveFeedback && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <span className="font-medium">Google Drive: </span>
            {driveFeedback}
          </div>
        )}

      </section>

      <section className="saas-card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-brand-light" />
            <h2 className="text-lg font-semibold text-brand-dark">Intake queue</h2>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showFullHistory}
              onChange={(e) => setShowFullHistory(e.target.checked)}
              className="rounded border-[hsl(var(--border))]"
            />
            Show all uploads (history)
          </label>
        </div>
        {!showFullHistory && sessionCutoffIso && (
          <p className="text-xs text-muted-foreground">
            Showing files from this browser tab session only. Enable &quot;Show all uploads&quot; to see older rows.
          </p>
        )}

        {localQueueRows.length > 0 && (
          <div className="rounded-xl border border-brand-light/30 bg-brand-light/5 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Current upload</p>
              <button
                type="button"
                onClick={() => setLocalQueueRows((prev) => prev.filter((row) => row.status !== "processed"))}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-brand-dark hover:underline"
              >
                Clear completed
              </button>
            </div>
            <ul className="space-y-2">
              {localQueueRows.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-col gap-2 rounded-lg border border-[hsl(var(--border))] bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex items-start gap-2">
                    {row.status === "uploading" || row.status === "processing" ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-light" />
                    ) : (
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-light" />
                    )}
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium text-foreground">{row.filename}</p>
                      {row.relativePath && row.relativePath !== row.filename && (
                        <p className="mt-0.5 line-clamp-1 break-all text-xs text-muted-foreground">
                          {row.relativePath}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        localStatusBadgeClass(row.status)
                      )}
                    >
                      {row.message ?? row.status}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatFileSize(row.size)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {initialRows.length === 0 && localQueueRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-muted/10 py-12 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto h-10 w-10 opacity-40" />
            <p className="mt-3">No uploads yet. Add PDFs above to see them listed here.</p>
          </div>
        ) : queueRows.length === 0 && localQueueRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-muted/10 py-12 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto h-10 w-10 opacity-40" />
            <p className="mt-3">No uploads in this session yet.</p>
            <button
              type="button"
              onClick={() => setShowFullHistory(true)}
              className="mt-3 text-sm font-medium text-brand-light underline-offset-2 hover:underline"
            >
              Show all uploads
            </button>
          </div>
        ) : queueRows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-[hsl(var(--card-border))]">
            <table className="w-full min-w-[1480px] text-left text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-muted/30">
                  <th className="px-4 py-3 font-semibold text-brand-dark">File</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Folder path</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Status</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Type</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Address (raw)</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Match result</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Confidence</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Property</th>
                  <th className="min-w-[280px] px-4 py-3 font-semibold text-brand-dark">Review</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Size</th>
                  <th className="px-4 py-3 font-semibold text-brand-dark">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queueRows.map((row) => {
                  const propId = row.matched_property_id ?? row.created_property_id
                  const manualEligible = canEnterPropertyManually(row, propId)
                  const displayStatus = propId ? "processed" : row.processing_status
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-[hsl(var(--border))] last:border-0",
                        row.needs_manual_review && !propId && "bg-amber-50/60 dark:bg-amber-950/20"
                      )}
                    >
                      <td className="min-w-[320px] max-w-[420px] px-4 py-3">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-light" />
                          <span className="break-all font-medium text-foreground">{row.filename}</span>
                        </div>
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-xs text-muted-foreground">
                        {row.source_relative_path?.trim() ? (
                          <span className="line-clamp-2 break-all" title={row.source_relative_path}>
                            {row.source_relative_path}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            statusBadgeClass(displayStatus)
                          )}
                        >
                          {formatQueueStatus(row)}
                        </span>
                        {row.error_message && (
                          <p className="mt-1 text-xs text-destructive">{row.error_message}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {row.detected_document_type ?? "—"}
                      </td>
                      <td className="max-w-[180px] px-4 py-3 text-muted-foreground">
                        {row.extracted_address_raw?.trim() || "—"}
                      </td>
                      <td className="max-w-[240px] px-4 py-3 text-muted-foreground">
                        <span className="line-clamp-3 text-xs leading-snug">{formatIntakeMatchSummary(row)}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        <span className="font-medium text-foreground">{formatConfidencePercent(row.confidence_score)}</span>
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
                          {matchTierFromScore(row.confidence_score)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {propId ? (
                          <Link
                            href={`/properties/${propId}`}
                            className="font-mono text-brand-light underline-offset-2 hover:underline"
                          >
                            {shortId(propId)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="min-w-[280px] px-4 py-3 align-top">
                        {propId ? (
                          <span className="text-xs text-muted-foreground">OK</span>
                        ) : row.processing_status === "uploaded" || row.processing_status === "processing" ? (
                          <span className="text-xs text-muted-foreground">Awaiting pipeline</span>
                        ) : manualEligible ? (
                          <div className="space-y-2">
                            {manualFormIntakeId === row.id ? (
                              <IntakeManualPropertyForm
                                key={row.id}
                                intakeUploadId={row.id}
                                propertyOptions={propertyOptions}
                                suggestedAddress={row.extracted_address_raw}
                                onDone={() => setManualFormIntakeId(null)}
                              />
                            ) : (
                              <>
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/80 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                                  <AlertTriangle className="h-3 w-3" />
                                  Needs action
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setManualFormIntakeId(row.id)}
                                  className="flex w-full max-w-xs items-center justify-center rounded-lg bg-brand-dark px-4 py-2.5 text-center text-sm font-semibold text-white shadow-md transition hover:bg-brand-dark/90"
                                >
                                  Enter property manually
                                </button>
                              </>
                            )}
                          </div>
                        ) : row.needs_manual_review ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/80 bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-950">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Review
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">OK</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatFileSize(row.original_file_size)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void handleDeleteQueueRow(row)}
                          disabled={(!propId && row.processing_status === "processing") || deletingIntakeId === row.id}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Delete ${row.filename} from intake queue`}
                          title={
                            !propId && row.processing_status === "processing"
                              ? "Processing rows can be deleted after processing finishes"
                              : "Delete intake queue row"
                          }
                        >
                          {deletingIntakeId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}

