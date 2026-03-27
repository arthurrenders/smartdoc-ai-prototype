"use client"

import { useEffect, useRef, useState } from "react"
import { FileDown } from "lucide-react"

type Props = {
  className?: string
}

export function ExportDataButton({ className = "" }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const root = rootRef.current
      if (!root) return
      if (!root.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onEsc)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    timeoutRef.current = window.setTimeout(() => setOpen(false), 2200)
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Export functionality coming soon"
        aria-label="Export data (coming soon)"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg bg-dashboard-surface-high px-4 py-2 text-sm font-medium text-dashboard-primary transition-all hover:bg-dashboard-surface-variant"
      >
        <FileDown className="h-4 w-4" />
        Export Data
      </button>

      {open ? (
        <div
          role="status"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-lg border border-dashboard-outline-variant/40 bg-white px-3 py-2 text-xs text-dashboard-on-surface shadow-lg"
        >
          Export functionality coming soon.
        </div>
      ) : null}
    </div>
  )
}

