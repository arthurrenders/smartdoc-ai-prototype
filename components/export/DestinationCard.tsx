"use client"

import { FileSpreadsheet, FileCode2, FileArchive, FileText } from "lucide-react"
import type { DestinationSummary } from "@/app/actions/export/get-readiness"

type Props = {
  destination: DestinationSummary
  selected: boolean
  onSelect: () => void
}

const DESCRIPTIONS: Record<string, string> = {
  zimmo: "Belgisch portaal — CSV met EPC-mapping en categorieën.",
  immoweb: "Belgisch portaal — CSV met Immoweb-velden.",
  realo: "Belgisch portaal — XML feed (realo_feed.xml).",
}

function formatIcon(format: string) {
  if (format === "csv") return <FileSpreadsheet className="h-5 w-5" />
  if (format === "xml") return <FileCode2 className="h-5 w-5" />
  if (format === "full_bundle") return <FileArchive className="h-5 w-5" />
  return <FileText className="h-5 w-5" />
}

export function DestinationCard({ destination, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
          : "border-[hsl(var(--card-border))] bg-white hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          {formatIcon(destination.output_format)}
          <span className="text-base font-bold">{destination.name}</span>
        </div>
        <span className="saas-badge saas-badge-muted text-[10px] uppercase tracking-wider">
          {destination.output_format}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {DESCRIPTIONS[destination.slug] ?? `${destination.type} · ${destination.output_format}`}
      </p>
    </button>
  )
}
