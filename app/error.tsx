"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[SmartDoc] Unhandled error:", error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafb]">
      <div className="w-full max-w-md px-8 py-16 text-center">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50 text-red-600 shadow-sm ring-1 ring-red-100">
          <AlertTriangle className="h-9 w-9" />
        </div>

        <h1 className="mb-3 font-headline text-2xl font-bold tracking-tight text-[#002741]">
          Er is iets misgegaan
        </h1>
        <p className="mb-2 text-sm leading-relaxed text-gray-500">
          Er is een onverwachte fout opgetreden. Probeer de pagina opnieuw te laden.
        </p>
        {error.digest && (
          <p className="mb-8 font-mono text-xs text-gray-400">Referentie: {error.digest}</p>
        )}

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-[#002741] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" />
          Opnieuw proberen
        </button>
      </div>
    </div>
  )
}
