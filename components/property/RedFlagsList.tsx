"use client"

import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FlagItem } from "@/app/actions/get-property-detail"

const DOC_TYPE_ORDER = ["EPC", "ASBESTOS", "ELECTRICAL"] as const

type RedFlagsListProps = {
  flags: FlagItem[]
  className?: string
}

const severityStyles = {
  red: "border-red-200 bg-red-50/80 dark:border-red-800 dark:bg-red-950/30",
  orange: "border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30",
  green: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30",
}

function groupFlagsByDocumentType(flags: FlagItem[]): Map<string, FlagItem[]> {
  const byType = new Map<string, FlagItem[]>()
  for (const flag of flags) {
    const key = flag.documentTypeName ?? "Other"
    if (!byType.has(key)) byType.set(key, [])
    byType.get(key)!.push(flag)
  }
  return byType
}

export function RedFlagsList({ flags, className = "" }: RedFlagsListProps) {
  const [expanded, setExpanded] = useState(true)

  if (flags.length === 0) {
    return (
      <div className={cn("rounded-xl border border-[hsl(var(--card-border))] bg-white p-5 shadow-sm", className)}>
        <h2 className="saas-section-heading text-xl sm:text-2xl">Bevindingen</h2>
        <p className="saas-section-subheading">Geen bevindingen voor dit pand.</p>
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--card-border))] bg-muted/15 px-6 py-12 text-center">
          <CheckCircle2
            className="h-12 w-12 text-green-600/70 dark:text-green-400/80"
            aria-hidden
          />
          <p className="mt-4 text-sm font-semibold text-foreground">Alles in orde &mdash; geen actie vereist.</p>
        </div>
      </div>
    )
  }

  const byType = groupFlagsByDocumentType(flags)
  const orderedTypes = [
    ...DOC_TYPE_ORDER.filter((t) => byType.has(t)),
    ...Array.from(byType.keys()).filter((k) => !DOC_TYPE_ORDER.includes(k as (typeof DOC_TYPE_ORDER)[number])),
  ]
  const redCount = flags.filter((f) => f.severity === "red").length
  const orangeCount = flags.filter((f) => f.severity === "orange").length

  return (
    <div className={cn(
      "rounded-xl border border-[hsl(var(--card-border))] bg-white shadow-sm transition-shadow duration-200",
      expanded ? "flex flex-col gap-4 p-5" : "p-4",
      className
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="saas-section-heading text-xl sm:text-2xl">Bevindingen</h2>
          <div className="flex items-center gap-1">
            {redCount > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                {redCount}
              </span>
            )}
            {orangeCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                {orangeCount}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-expanded={expanded}
        >
          {expanded ? (
            <><ChevronUp className="h-3.5 w-3.5" /> Inklappen</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5" /> Uitklappen</>
          )}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-6">
          {orderedTypes.map((docType) => {
            const items = byType.get(docType) ?? []
            return (
              <div key={docType} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  {docType}
                </h3>
                <ul className="flex flex-col gap-3" role="list">
                  {items.map((flag, index) => (
                    <li
                      key={`${docType}-${index}-${flag.title}`}
                      className={cn(
                        "flex gap-4 rounded-xl border px-4 py-4 transition-shadow duration-200 sm:px-5 sm:py-4",
                        severityStyles[flag.severity]
                      )}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-card text-xs font-medium text-muted-foreground"
                        aria-hidden
                      >
                        !
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{flag.title}</span>
                          {flag.occurrenceCount != null && flag.occurrenceCount > 1 && (
                            <span className="text-xs text-muted-foreground">
                              Gevonden in {flag.occurrenceCount} documenten
                            </span>
                          )}
                        </div>
                        {flag.details && (
                          <p className="mt-1 text-sm text-muted-foreground">{flag.details}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
