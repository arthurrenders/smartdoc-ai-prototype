"use client"

import { useState } from "react"
import { FileDown } from "lucide-react"
import { usePathname } from "next/navigation"
import { ExportModal } from "@/components/export/ExportModal"
import { ExportToast } from "@/components/export/ExportToast"
import { matchPropertyIdFromPath } from "@/lib/utils/match-property-id-from-path"

type Props = {
  className?: string
}

export function ExportDataButton({ className = "" }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const presetPropertyId = matchPropertyIdFromPath(pathname)

  return (
    <>
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Smart Export openen"
          className="inline-flex items-center gap-2 rounded-lg bg-dashboard-surface-high px-4 py-2 text-sm font-medium text-dashboard-primary transition-all hover:bg-dashboard-surface-variant"
        >
          <FileDown className="h-4 w-4" />
          Export Data
        </button>
      </div>

      {open && (
        <ExportModal initialPropertyId={presetPropertyId} onClose={() => setOpen(false)} />
      )}

      <ExportToast />
    </>
  )
}
