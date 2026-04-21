"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Upload,
  FileText,
  AlertTriangle,
  Loader2,
  RefreshCw,
  FolderOpen,
} from "lucide-react"

import type { IntakeUploadRow, IntakeProcessingStatus } from "@/lib/intake/types"
import { bulkIntakeUpload } from "@/app/actions/bulk-intake-upload"
import { processIntakeUploads } from "@/app/actions/process-intake-uploads"
import { cn } from "@/lib/utils"

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
      return "border-[#519fc8]/40 bg-[#519fc8]/15 text-[#0e3b6a]"
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

function formatStatusLabel(status: IntakeProcessingStatus): string {
  return status.replace(/_/g, " ")
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

function formatIntakeMatchSummary(row: IntakeUploadRow): string {
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
}

export function BulkIntakeClient({ initialRows, loadError }: BulkIntakeClientProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  const handleFiles = useCallback(
    async (list: FileList | File[]) => {
      const files = Array.from(list).filter((f) => f.size > 0)
      if (!files.length) return

      setMessage(null)
      setIsWorking(true)
      try {
        const formData = new FormData()
        for (const f of files) {
          formData.append("files", f)
        }

        const res = await bulkIntakeUpload(formData)
        if (!res.ok && !res.results.some((r) => r.intakeId)) {
          setMessage({
            type: "err",
            text: res.error ?? "Upload failed.",
          })
          router.refresh()
          return
        }

        const errors = res.results.filter((r) => r.error)
        const okIds = res.results.map((r) => r.intakeId).filter(Boolean) as string[]

        if (errors.length) {
          setMessage({
            type: "err",
            text: `${errors.length} file(s) failed: ${errors.map((e) => `${e.filename}: ${e.error}`).join("; ")}`,
          })
        } else {
          setMessage({
            type: "ok",
            text: `${okIds.length} file(s) uploaded. Running property matching…`,
          })
        }

        router.refresh()

        if (okIds.length) {
          const procRes = await processIntakeUploads(okIds)
          if (!procRes.ok) {
            setMessage({
              type: "err",
              text: procRes.error ?? "Processing failed.",
            })
          } else if (!errors.length) {
            setMessage({
              type: "ok",
              text: `${okIds.length} file(s) processed: address matching, property link or create, and document registration (see queue for details).`,
            })
          }
          router.refresh()
        }
      } finally {
        setIsWorking(false)
      }
    },
    [router]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files?.length) {
        void handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
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
            <h2 className="text-lg font-semibold text-[#0e3b6a]">Upload documents</h2>
            <p className="text-sm text-muted-foreground">
              PDFs only — EPC, asbestos, electrical certificates. Files are stored and queued for processing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm font-medium text-[#0e3b6a] shadow-sm transition hover:bg-muted/40"
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
              ? "border-[#519fc8] bg-[#519fc8]/10"
              : "border-[hsl(var(--border))] bg-muted/20 hover:border-[#519fc8]/50 hover:bg-[#519fc8]/5"
          )}
        >
          <div className="rounded-full bg-[#0e3b6a]/10 p-4 text-[#0e3b6a]">
            <Upload className="h-8 w-8" />
          </div>
          <p className="mt-4 font-medium text-[#0e3b6a]">Drag & drop PDFs here</p>
          <p className="mt-1 text-sm text-muted-foreground">or click to browse — multiple files supported</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const fl = e.target.files
              if (fl?.length) void handleFiles(fl)
              e.target.value = ""
            }}
          />
        </div>

        {isWorking && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-[#519fc8]" />
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

        <p className="text-xs text-muted-foreground">
          After upload, text is read from each PDF, then <strong>Gemini</strong> (same stack as EPC / asbestos / electrical
          analysis) extracts a Belgian building address when possible; if the model is unsure or unavailable, a local
          line-based fallback runs. The app then links via <code className="rounded bg-muted px-1">property_addresses</code>
          , creates a property, or flags <strong>manual review</strong> when confidence is too low or matches are ambiguous.
        </p>
      </section>

      <section className="saas-card space-y-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-[#519fc8]" />
          <h2 className="text-lg font-semibold text-[#0e3b6a]">Intake queue</h2>
        </div>

        {initialRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-muted/10 py-12 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto h-10 w-10 opacity-40" />
            <p className="mt-3">No uploads yet. Add PDFs above to see them listed here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[hsl(var(--card-border))]">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-muted/30">
                  <th className="px-4 py-3 font-semibold text-[#0e3b6a]">File</th>
                  <th className="px-4 py-3 font-semibold text-[#0e3b6a]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[#0e3b6a]">Type</th>
                  <th className="px-4 py-3 font-semibold text-[#0e3b6a]">Address (raw)</th>
                  <th className="px-4 py-3 font-semibold text-[#0e3b6a]">Match result</th>
                  <th className="px-4 py-3 font-semibold text-[#0e3b6a]">Confidence</th>
                  <th className="px-4 py-3 font-semibold text-[#0e3b6a]">Property</th>
                  <th className="px-4 py-3 font-semibold text-[#0e3b6a]">Review</th>
                  <th className="px-4 py-3 font-semibold text-[#0e3b6a]">Size</th>
                </tr>
              </thead>
              <tbody>
                {initialRows.map((row) => {
                  const propId = row.matched_property_id ?? row.created_property_id
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-[hsl(var(--border))] last:border-0",
                        row.needs_manual_review && "bg-amber-50/60 dark:bg-amber-950/20"
                      )}
                    >
                      <td className="max-w-[200px] px-4 py-3">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#519fc8]" />
                          <span className="break-all font-medium text-foreground">{row.filename}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
                            statusBadgeClass(row.processing_status)
                          )}
                        >
                          {formatStatusLabel(row.processing_status)}
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
                            className="font-mono text-[#519fc8] underline-offset-2 hover:underline"
                          >
                            {shortId(propId)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.needs_manual_review ? (
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
