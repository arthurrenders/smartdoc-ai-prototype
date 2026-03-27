"use client"

import { useEffect, useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"

export function MapRefreshButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    if (!showDone) return
    const timer = window.setTimeout(() => setShowDone(false), 1800)
    return () => window.clearTimeout(timer)
  }, [showDone])

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() =>
          startTransition(() => {
            router.refresh()
            setShowDone(true)
          })
        }
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-dashboard-surface-high px-4 py-2 text-sm font-medium text-dashboard-primary transition-colors hover:bg-dashboard-surface-variant disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Refreshing..." : "Refresh"}
      </button>
      {showDone && !isPending ? (
        <span className="text-xs font-medium text-dashboard-on-surface-variant">
          Map refreshed
        </span>
      ) : null}
    </div>
  )
}

