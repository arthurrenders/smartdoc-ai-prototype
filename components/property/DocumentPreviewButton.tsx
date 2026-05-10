"use client"

import { useEffect, useState, useTransition } from "react"
import { Eye, ExternalLink, X as XIcon } from "lucide-react"
import { getDocumentPreviewUrl } from "@/app/actions/get-document-preview-url"

type DocumentPreviewButtonProps = {
  documentId: string
  label: string
}

export function DocumentPreviewButton({
  documentId,
  label,
}: DocumentPreviewButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isOpen])

  function close() {
    setIsOpen(false)
    setPreviewUrl(null)
    setFilename(null)
    setError(null)
  }

  function open() {
    setError(null)
    startTransition(async () => {
      const result = await getDocumentPreviewUrl({ documentId })
      if (!result.ok) {
        setError(result.error)
        setIsOpen(true)
        return
      }
      setPreviewUrl(result.previewUrl)
      setFilename(result.filename)
      setIsOpen(true)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={isPending}
        className="saas-btn-secondary"
        aria-label={`Voorbeeld bekijken: ${label}`}
      >
        <Eye className="h-4 w-4" aria-hidden />
        {isPending ? "Laden…" : "Bekijken"}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label={`Voorbeeld: ${label}`}
          onClick={close}
        >
          <div
            className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {label}
                </p>
                {filename && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {filename}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Open in nieuw tabblad
                  </a>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  aria-label="Sluiten"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden bg-muted/30">
              {error ? (
                <div className="flex h-full items-center justify-center px-6">
                  <div
                    className="max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                    role="alert"
                  >
                    {error}
                  </div>
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={`Voorbeeld: ${filename ?? label}`}
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Voorbeeld laden…
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
