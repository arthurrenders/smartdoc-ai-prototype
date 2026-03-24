import { CheckCircle2 } from "lucide-react"
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
  if (flags.length === 0) {
    return (
      <div className={cn("saas-card flex flex-col gap-2", className)}>
        <h2 className="saas-section-heading text-xl sm:text-2xl">Issues &amp; flags</h2>
        <p className="saas-section-subheading">No issues or flags reported for this property.</p>
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--card-border))] bg-muted/15 px-6 py-12 text-center">
          <CheckCircle2
            className="h-12 w-12 text-green-600/70 dark:text-green-400/80"
            aria-hidden
          />
          <p className="mt-4 text-sm font-semibold text-foreground">All clear — no action needed.</p>
        </div>
      </div>
    )
  }

  const byType = groupFlagsByDocumentType(flags)
  const orderedTypes = [
    ...DOC_TYPE_ORDER.filter((t) => byType.has(t)),
    ...Array.from(byType.keys()).filter((k) => !DOC_TYPE_ORDER.includes(k as (typeof DOC_TYPE_ORDER)[number])),
  ]

  return (
    <div className={cn("saas-card flex flex-col gap-6", className)}>
      <h2 className="saas-section-heading text-xl sm:text-2xl">Issues &amp; flags</h2>
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
                            Found in {flag.occurrenceCount} documents
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
    </div>
  )
}
