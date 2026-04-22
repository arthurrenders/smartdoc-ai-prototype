"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, X } from "lucide-react"

export const GMAIL_SENT_EVENT = "smartdoc-gmail-email-sent"

export function GmailSentToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function handler() {
      setVisible(true)
    }
    window.addEventListener(GMAIL_SENT_EVENT, handler)
    return () => window.removeEventListener(GMAIL_SENT_EVENT, handler)
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg"
    >
      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
      <span className="text-sm font-medium text-emerald-800">Email sent via Gmail.</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-100"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
