"use client"

import { useState, useMemo } from "react"
import { Search, Home } from "lucide-react"
import type { ExportPropertyRow } from "@/app/actions/export/list-properties-for-export"

type Props = {
  properties: ExportPropertyRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function PropertyPicker({ properties, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return properties
    return properties.filter((p) => {
      const name = (p.display_name ?? "").toLowerCase()
      const addr = (p.address_line ?? "").toLowerCase()
      return name.includes(q) || addr.includes(q)
    })
  }, [properties, query])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoeken op naam of adres…"
          className="w-full rounded-md border border-[hsl(var(--border))] bg-background py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-[hsl(var(--card-border))] px-4 py-8 text-center text-sm text-muted-foreground">
          Geen panden gevonden.
        </p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {filtered.map((p) => {
            const isSelected = p.id === selectedId
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-[hsl(var(--card-border))] bg-white hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  <Home className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {p.display_name ?? `Pand ${p.id.slice(0, 8).toUpperCase()}`}
                    </p>
                    {p.address_line && (
                      <p className="truncate text-xs text-muted-foreground">{p.address_line}</p>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
