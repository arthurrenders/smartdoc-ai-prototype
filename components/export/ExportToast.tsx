"use client"

import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"

export const EXPORT_COMPLETE_EVENT = "smartdoc-export-complete"

export function ExportToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: number | undefined
    function handler() {
      setVisible(true)
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => setVisible(false), 4000)
    }
    window.addEventListener(EXPORT_COMPLETE_EVENT, handler)
    return () => {
      window.removeEventListener(EXPORT_COMPLETE_EVENT, handler)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-[10000] flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg"
    >
      <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
      <div className="text-sm">
        <p className="font-semibold text-emerald-900">Klaar — bestand wordt gedownload</p>
        <p className="text-xs text-emerald-700">Smart Export ZIP is gegenereerd.</p>
      </div>
    </div>
  )
}
