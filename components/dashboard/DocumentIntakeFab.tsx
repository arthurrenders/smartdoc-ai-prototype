"use client"

import Link from "next/link"
import { Upload } from "lucide-react"

/**
 * Dashboard floating action — same placement as the legacy upload control; navigates to document intake.
 */
export function DocumentIntakeFab() {
  return (
    <Link
      href="/intake"
      className="fixed bottom-8 right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-dashboard-primary text-white shadow-lg transition-all hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dashboard-primary"
      aria-label="Document intake"
      title="Document intake"
    >
      <Upload className="h-6 w-6" aria-hidden />
    </Link>
  )
}
