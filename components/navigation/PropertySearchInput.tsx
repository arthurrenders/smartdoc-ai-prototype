"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

type Props = {
  placeholder?: string
  className?: string
  initialQuery?: string
}

export function PropertySearchInput({
  placeholder = "Search properties...",
  className = "",
  initialQuery = "",
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialQuery)

  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      const next = value.trim()
      const current = searchParams.get("q")?.trim() ?? ""

      if (next === current) return

      if (next) {
        params.set("q", next)
      } else {
        params.delete("q")
      }

      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [value, pathname, router, searchParams])

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dashboard-on-surface-variant" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-lg border border-dashboard-outline-variant/30 bg-white py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-primary/30"
        placeholder={placeholder}
        type="text"
        aria-label={placeholder}
      />
    </div>
  )
}

